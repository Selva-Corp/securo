"""Find recurring charges (subscriptions, bills) in real transaction history.

Rocket Money's headline feature is telling the user "you are paying for
these things every month" without them ever typing a bill in. Securo's
recurring module works the other way round — the user declares a bill and
`recurring_match_service` links the charges that pay it. This module closes
the gap: it looks at the charges that already happened and proposes the
bills.

Pure functions only. The caller (``subscription_service``) loads the rows,
this module groups them by merchant, checks for a regular cadence and a
stable amount, and returns candidate series. Keeping it free of the database
makes the heuristics cheap to unit-test and cheap to tune.
"""

from __future__ import annotations

import re
import statistics
import uuid
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from datetime import date, timedelta
from decimal import Decimal
from typing import Optional

from app.services.recurring_transaction_service import _advance_date
from app.services.rule_engine import _normalize

# Cadence name -> (min gap days, max gap days, nominal period days). Bands stay
# well apart so a series can never satisfy two of them at once.
CADENCES: dict[str, tuple[int, int, int]] = {
    "weekly": (5, 9, 7),
    "biweekly": (12, 16, 14),
    "monthly": (26, 35, 30),
    "quarterly": (80, 100, 91),
    "yearly": (350, 380, 365),
}

# Share of gaps that must fall inside the chosen cadence band.
REGULARITY_THRESHOLD = 0.7
# Coefficient of variation (stdev / median) above which amounts are "variable".
AMOUNT_STABILITY_MAX = Decimal("0.25")
# Relative change that counts as a price change worth recording.
PRICE_CHANGE_PCT = Decimal("0.02")
# Two charges closer than this are the same charge (retry, split capture).
MIN_GAP_DAYS = 3
# A series with no charge for this many periods is considered lapsed.
LAPSED_FACTOR = 1.5
# Minimum charges before a series is worth proposing.
MIN_OCCURRENCES = 3
MIN_OCCURRENCES_YEARLY = 2

# Bank-statement noise that says nothing about the merchant.
_STOPWORDS = frozenset(
    {
        "POS", "PURCHASE", "DEBIT", "CREDIT", "CARD", "CHECKCARD", "PAYMENT", "PMT",
        "RECURRING", "AUTOPAY", "ACH", "ONLINE", "INTERNET", "WEB", "WWW", "COM", "NET",
        "ORG", "INC", "LLC", "LTD", "CO", "DES", "ID", "REF", "VISA", "MASTERCARD", "MC",
        "TST", "SQ", "SP", "PAGAMENTO", "COMPRA", "DEB", "AUT",
    }
)
_TOKEN_SPLIT = re.compile(r"[^A-Z0-9]+")
_MAX_KEY_TOKENS = 3


@dataclass(frozen=True)
class ChargeRow:
    """The slice of a Transaction the detector needs."""

    id: uuid.UUID
    date: date
    amount: Decimal
    currency: str
    description: str
    payee_id: Optional[uuid.UUID] = None
    account_id: Optional[uuid.UUID] = None
    category_id: Optional[uuid.UUID] = None
    recurring_transaction_id: Optional[uuid.UUID] = None


@dataclass
class DetectedSeries:
    merchant_key: str
    display_name: str
    payee_id: Optional[uuid.UUID]
    currency: str
    cadence: str
    amount: Decimal
    average_amount: Decimal
    first_seen: date
    last_seen: date
    next_expected: date
    occurrence_count: int
    confidence: Decimal
    is_lapsed: bool
    price_history: list[dict] = field(default_factory=list)
    transaction_ids: list[uuid.UUID] = field(default_factory=list)
    account_id: Optional[uuid.UUID] = None
    category_id: Optional[uuid.UUID] = None
    # Set when the charges are already linked to one recurring bill, so the
    # hub can show that bill as tracked instead of proposing a duplicate.
    linked_recurring_id: Optional[uuid.UUID] = None

    @property
    def price_changed(self) -> bool:
        return len(self.price_history) > 1


def merchant_key(description: Optional[str]) -> str:
    """Collapse a statement description to a merchant fingerprint.

    ``"NETFLIX.COM*4X7Q2 09/02"`` and ``"Netflix.com *8KJ21"`` both become
    ``"NETFLIX"``; ``"PAYPAL *SPOTIFY"`` becomes ``"PAYPAL SPOTIFY"``. Tokens
    containing digits are reference codes or dates, never the merchant.
    """
    if not description:
        return ""
    tokens = [t for t in _TOKEN_SPLIT.split(_normalize(description)) if t]
    kept = [
        t for t in tokens
        if len(t) > 1 and not any(ch.isdigit() for ch in t) and t not in _STOPWORDS
    ]
    if not kept:
        kept = [t for t in tokens if len(t) > 1] or tokens
    return " ".join(kept[:_MAX_KEY_TOKENS])


def display_name_for(description: Optional[str]) -> str:
    """Human-friendly name derived from the same tokens as the merchant key."""
    key = merchant_key(description)
    return key.title() if key else (description or "").strip()[:100]


def _classify_cadence(gaps: list[int]) -> Optional[tuple[str, float]]:
    """Return (cadence, regularity) for a gap list, or None if irregular."""
    if not gaps:
        return None
    median_gap = statistics.median(gaps)
    for name, (lo, hi, _nominal) in CADENCES.items():
        if lo <= median_gap <= hi:
            regularity = sum(1 for g in gaps if lo <= g <= hi) / len(gaps)
            if regularity >= REGULARITY_THRESHOLD:
                return name, regularity
            return None
    return None


def _dedupe_close_charges(rows: list[ChargeRow]) -> list[ChargeRow]:
    """Drop charges that land within MIN_GAP_DAYS of the previous kept one."""
    kept: list[ChargeRow] = []
    for row in rows:
        if kept and (row.date - kept[-1].date).days < MIN_GAP_DAYS:
            continue
        kept.append(row)
    return kept


def _price_history(rows: list[ChargeRow]) -> list[dict]:
    history: list[dict] = []
    current: Optional[Decimal] = None
    for row in rows:
        if current is None or abs(row.amount - current) > current * PRICE_CHANGE_PCT:
            history.append({"date": row.date.isoformat(), "amount": str(row.amount)})
            current = row.amount
    return history


def _next_expected(last: date, cadence: str) -> date:
    if cadence == "weekly":
        return last + timedelta(weeks=1)
    if cadence == "biweekly":
        return last + timedelta(weeks=2)
    return _advance_date(last, cadence, intended_day=last.day)


def _quantize(value: Decimal) -> Decimal:
    return value.quantize(Decimal("0.01"))


def _series_from_rows(rows: list[ChargeRow], today: date) -> Optional[DetectedSeries]:
    rows = _dedupe_close_charges(sorted(rows, key=lambda r: r.date))
    gaps = [(b.date - a.date).days for a, b in zip(rows, rows[1:])]
    classified = _classify_cadence(gaps)
    if classified is None:
        return None
    cadence, regularity = classified
    minimum = MIN_OCCURRENCES_YEARLY if cadence == "yearly" else MIN_OCCURRENCES
    if len(rows) < minimum:
        return None

    amounts = [r.amount for r in rows]
    median_amount = Decimal(str(statistics.median(amounts)))
    if median_amount <= 0:
        return None
    stdev = Decimal(str(statistics.stdev(amounts))) if len(amounts) > 1 else Decimal(0)
    variation = stdev / median_amount
    if variation > AMOUNT_STABILITY_MAX:
        return None

    last = rows[-1]
    nominal_days = CADENCES[cadence][2]
    is_lapsed = today > last.date + timedelta(days=int(nominal_days * LAPSED_FACTOR))

    stability_score = 1 - min(float(variation / AMOUNT_STABILITY_MAX), 1.0)
    count_score = min(len(rows) / 6, 1.0)
    recency_score = 0.0 if is_lapsed else 1.0
    confidence = (
        0.4 * regularity + 0.3 * stability_score + 0.2 * count_score + 0.1 * recency_score
    )

    recurring_ids = Counter(r.recurring_transaction_id for r in rows if r.recurring_transaction_id)
    linked: Optional[uuid.UUID] = None
    if recurring_ids:
        candidate, hits = recurring_ids.most_common(1)[0]
        if hits * 2 >= len(rows):
            linked = candidate

    categories = Counter(r.category_id for r in rows if r.category_id)
    payees = Counter(r.payee_id for r in rows if r.payee_id)

    return DetectedSeries(
        merchant_key=merchant_key(last.description),
        display_name=display_name_for(last.description),
        payee_id=payees.most_common(1)[0][0] if payees else None,
        currency=last.currency,
        cadence=cadence,
        amount=_quantize(last.amount),
        average_amount=_quantize(Decimal(str(statistics.mean(amounts)))),
        first_seen=rows[0].date,
        last_seen=last.date,
        next_expected=_next_expected(last.date, cadence),
        occurrence_count=len(rows),
        confidence=Decimal(str(round(confidence, 2))),
        is_lapsed=is_lapsed,
        price_history=_price_history(rows),
        transaction_ids=[r.id for r in rows],
        account_id=last.account_id,
        category_id=categories.most_common(1)[0][0] if categories else None,
        linked_recurring_id=linked,
    )


def detect_series(rows: list[ChargeRow], today: Optional[date] = None) -> list[DetectedSeries]:
    """Group charges by merchant and return every series with a regular cadence.

    Grouping prefers the payee link when the user (or a rule) has assigned
    one, and falls back to the description fingerprint. Currency is part of
    the key: the same merchant billed in two currencies is two subscriptions.
    Account is deliberately not part of the key — a reissued card must not
    split a subscription in two.
    """
    today = today or date.today()
    groups: dict[tuple, list[ChargeRow]] = defaultdict(list)
    for row in rows:
        if row.amount <= 0:
            continue
        if row.payee_id is not None:
            key: tuple = ("payee", row.payee_id, row.currency)
        else:
            fingerprint = merchant_key(row.description)
            if not fingerprint:
                continue
            key = ("desc", fingerprint, row.currency)
        groups[key].append(row)

    series: list[DetectedSeries] = []
    for key, group in groups.items():
        found = _series_from_rows(group, today)
        if found is None:
            continue
        if key[0] == "payee":
            # A payee-keyed series keeps a stable fingerprint even when the
            # statement text drifts, so upserts match across scans.
            found.merchant_key = f"payee:{key[1]}"
        series.append(found)
    series.sort(key=lambda s: (s.is_lapsed, -s.confidence, s.display_name))
    return series
