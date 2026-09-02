"""Subscriptions hub (fork feature): scan, persist and act on detected charges.

The detector (`subscription_detector`) is pure; this module owns the database
side. A scan upserts one `Subscription` row per merchant + currency and keeps
the user's decision (`status`) across rescans, so a dismissed suggestion stays
dismissed and a tracked bill keeps its recurring link.

Events returned by `scan_workspace` (new subscription, price change, charge
after cancellation) are what the alerts feature listens to.
"""

from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from typing import Optional

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.payee import Payee
from app.models.recurring_transaction import RecurringTransaction
from app.models.subscription import Subscription
from app.models.transaction import Transaction
from app.models.workspace import Workspace
from app.providers.favicon import favicon_url_for
from app.schemas.recurring_transaction import RecurringTransactionCreate
from app.schemas.subscription import SubscriptionUpdate
from app.services import recurring_transaction_service
from app.services._query_filters import counts_as_pnl
from app.services.recurring_match_service import _REAL_SOURCES
from app.services.subscription_detector import (
    CADENCES,
    LAPSED_FACTOR,
    ChargeRow,
    DetectedSeries,
    _next_expected,
    detect_series,
)

logger = logging.getLogger(__name__)

HISTORY_MONTHS = 24
UPCOMING_WINDOW_DAYS = 30

# Multiply a per-charge amount by this to get a per-month cost.
MONTHLY_FACTOR: dict[str, Decimal] = {
    "weekly": Decimal(52) / Decimal(12),
    "biweekly": Decimal(26) / Decimal(12),
    "monthly": Decimal(1),
    "quarterly": Decimal(1) / Decimal(3),
    "yearly": Decimal(1) / Decimal(12),
}

ACTIVE_STATUSES = ("tracked", "suggested")


@dataclass
class ScanEvent:
    kind: str  # new_subscription | price_changed | charge_after_cancel
    subscription: Subscription
    detail: dict = field(default_factory=dict)


@dataclass
class ScanResult:
    created: int = 0
    updated: int = 0
    removed: int = 0
    events: list[ScanEvent] = field(default_factory=list)


def is_lapsed(sub: Subscription, today: Optional[date] = None) -> bool:
    today = today or date.today()
    nominal = CADENCES.get(sub.cadence, CADENCES["monthly"])[2]
    return today > sub.last_seen + timedelta(days=int(nominal * LAPSED_FACTOR))


def monthly_equivalent(amount: Decimal, cadence: str) -> Decimal:
    factor = MONTHLY_FACTOR.get(cadence, Decimal(1))
    return (Decimal(amount) * factor).quantize(Decimal("0.01"))


def next_occurrence_on_or_after(start: date, cadence: str, today: date) -> date:
    current = start
    guard = 0
    while current < today and guard < 500:
        current = _next_expected(current, cadence)
        guard += 1
    return current


# ---------------------------------------------------------------------------
# Scanning
# ---------------------------------------------------------------------------


async def load_charges(
    session: AsyncSession, workspace_id: uuid.UUID, since: date
) -> list[ChargeRow]:
    """Real, posted debits that count as spending, newest history window only."""
    result = await session.execute(
        select(
            Transaction.id,
            Transaction.date,
            Transaction.amount,
            Transaction.currency,
            Transaction.description,
            Transaction.payee_id,
            Transaction.account_id,
            Transaction.category_id,
            Transaction.recurring_transaction_id,
        ).where(
            Transaction.workspace_id == workspace_id,
            Transaction.source.in_(_REAL_SOURCES),
            Transaction.type == "debit",
            Transaction.status == "posted",
            Transaction.date >= since,
            counts_as_pnl(),
        )
    )
    return [
        ChargeRow(
            id=row.id,
            date=row.date,
            amount=Decimal(row.amount),
            currency=row.currency,
            description=row.description or "",
            payee_id=row.payee_id,
            account_id=row.account_id,
            category_id=row.category_id,
            recurring_transaction_id=row.recurring_transaction_id,
        )
        for row in result.all()
    ]


async def _payee_names(session: AsyncSession, workspace_id: uuid.UUID) -> dict[uuid.UUID, str]:
    result = await session.execute(
        select(Payee.id, Payee.name).where(Payee.workspace_id == workspace_id)
    )
    return {row.id: row.name for row in result.all()}


def _apply_stats(sub: Subscription, series: DetectedSeries, now: datetime) -> None:
    sub.cadence = series.cadence
    sub.amount = series.amount
    sub.average_amount = series.average_amount
    sub.first_seen = series.first_seen
    sub.last_seen = series.last_seen
    sub.next_expected = series.next_expected
    sub.occurrence_count = series.occurrence_count
    sub.confidence = series.confidence
    sub.price_history = series.price_history
    sub.transaction_ids = [str(tx_id) for tx_id in series.transaction_ids]
    sub.last_scanned_at = now
    if sub.account_id is None:
        sub.account_id = series.account_id
    if sub.category_id is None:
        sub.category_id = series.category_id
    if sub.payee_id is None:
        sub.payee_id = series.payee_id


async def scan_workspace(
    session: AsyncSession,
    workspace_id: uuid.UUID,
    user_id: uuid.UUID,
    today: Optional[date] = None,
    deliver_alerts: bool = False,
) -> ScanResult:
    """Detect series in the workspace's history and upsert Subscription rows.

    `deliver_alerts` pushes resulting alerts right away (worker callers); request
    callers leave it False and the minute-ly delivery sweep sends them.
    """
    today = today or date.today()
    now = datetime.now(timezone.utc)
    since = today - timedelta(days=HISTORY_MONTHS * 31)
    charges = await load_charges(session, workspace_id, since)
    detected = detect_series(charges, today=today)

    existing_rows = (
        await session.execute(select(Subscription).where(Subscription.workspace_id == workspace_id))
    ).scalars().all()
    existing = {(s.merchant_key, s.currency): s for s in existing_rows}
    payee_names = await _payee_names(session, workspace_id)

    result = ScanResult()
    seen: set[tuple[str, str]] = set()

    for series in detected:
        key = (series.merchant_key, series.currency)
        seen.add(key)
        sub = existing.get(key)
        if sub is None:
            sub = Subscription(
                user_id=user_id,
                workspace_id=workspace_id,
                merchant_key=series.merchant_key,
                display_name=(
                    payee_names.get(series.payee_id) if series.payee_id else None
                ) or series.display_name,
                payee_id=series.payee_id,
                account_id=series.account_id,
                category_id=series.category_id,
                currency=series.currency,
                status="tracked" if series.linked_recurring_id else "suggested",
                recurring_transaction_id=series.linked_recurring_id,
            )
            _apply_stats(sub, series, now)
            session.add(sub)
            result.created += 1
            if sub.status == "suggested" and not series.is_lapsed:
                result.events.append(ScanEvent("new_subscription", sub))
            continue

        previous_amount = Decimal(sub.amount)
        previous_last_seen = sub.last_seen
        _apply_stats(sub, series, now)
        result.updated += 1

        if (
            series.linked_recurring_id
            and sub.status == "suggested"
            and sub.recurring_transaction_id is None
        ):
            sub.status = "tracked"
            sub.recurring_transaction_id = series.linked_recurring_id

        if sub.status == "cancelled":
            if (
                sub.cancelled_at
                and series.last_seen > sub.cancelled_at
                and series.last_seen != previous_last_seen
            ):
                result.events.append(
                    ScanEvent(
                        "charge_after_cancel", sub,
                        {"date": series.last_seen.isoformat(), "amount": str(series.amount)},
                    )
                )
        elif sub.status in ACTIVE_STATUSES and series.amount != previous_amount:
            result.events.append(
                ScanEvent(
                    "price_changed", sub,
                    {"old_amount": str(previous_amount), "new_amount": str(series.amount)},
                )
            )

    # Suggestions the user never acted on that no longer qualify are noise.
    for key, sub in existing.items():
        if key not in seen and sub.status == "suggested":
            await session.delete(sub)
            result.removed += 1

    await session.commit()
    for event in result.events:
        await session.refresh(event.subscription)
    if result.events:
        from app.services import notification_service  # local: avoids an import cycle

        await notification_service.notify_subscription_events(
            session, workspace_id, user_id, result.events, deliver=deliver_alerts
        )
        await session.commit()
    return result


async def scan_workspace_safely(
    session: AsyncSession, workspace_id: uuid.UUID, user_id: uuid.UUID, deliver_alerts: bool = False
) -> Optional[ScanResult]:
    """Scan after a sync/import without letting a detector bug fail the caller."""
    try:
        return await scan_workspace(session, workspace_id, user_id, deliver_alerts=deliver_alerts)
    except Exception:
        logger.exception("Subscription scan failed for workspace %s", workspace_id)
        await session.rollback()
        return None


# ---------------------------------------------------------------------------
# Reads
# ---------------------------------------------------------------------------


async def list_subscriptions(
    session: AsyncSession, workspace_id: uuid.UUID, status: Optional[str] = None
) -> list[Subscription]:
    query = select(Subscription).where(Subscription.workspace_id == workspace_id)
    if status:
        query = query.where(Subscription.status == status)
    query = query.order_by(Subscription.next_expected, Subscription.display_name)
    return list((await session.execute(query)).scalars().all())


async def get_subscription(
    session: AsyncSession, workspace_id: uuid.UUID, subscription_id: uuid.UUID
) -> Optional[Subscription]:
    result = await session.execute(
        select(Subscription).where(
            Subscription.id == subscription_id, Subscription.workspace_id == workspace_id
        )
    )
    return result.scalar_one_or_none()


async def get_charges(session: AsyncSession, sub: Subscription) -> list[Transaction]:
    ids = [uuid.UUID(value) for value in (sub.transaction_ids or [])]
    if not ids:
        return []
    result = await session.execute(
        select(Transaction)
        .where(Transaction.id.in_(ids), Transaction.workspace_id == sub.workspace_id)
        .order_by(Transaction.date.desc())
    )
    return list(result.scalars().all())


async def payee_logo_urls(
    session: AsyncSession, workspace_id: uuid.UUID
) -> dict[uuid.UUID, Optional[str]]:
    result = await session.execute(
        select(Payee.id, Payee.website).where(Payee.workspace_id == workspace_id)
    )
    return {row.id: favicon_url_for(row.website) for row in result.all()}


async def get_summary(
    session: AsyncSession, workspace_id: uuid.UUID, today: Optional[date] = None
) -> dict:
    today = today or date.today()
    rows = await list_subscriptions(session, workspace_id)
    workspace = await session.get(Workspace, workspace_id)
    primary = (workspace.default_currency if workspace else None) or "USD"

    counts = {"tracked": 0, "suggested": 0, "cancelled": 0, "ignored": 0}
    monthly_by_currency: dict[str, Decimal] = {}
    upcoming: list[Subscription] = []
    last_scanned: Optional[datetime] = None
    horizon = today + timedelta(days=UPCOMING_WINDOW_DAYS)

    for sub in rows:
        counts[sub.status] = counts.get(sub.status, 0) + 1
        if sub.last_scanned_at and (last_scanned is None or sub.last_scanned_at > last_scanned):
            last_scanned = sub.last_scanned_at
        if sub.status not in ACTIVE_STATUSES or is_lapsed(sub, today):
            continue
        monthly_by_currency[sub.currency] = monthly_by_currency.get(
            sub.currency, Decimal(0)
        ) + monthly_equivalent(sub.amount, sub.cadence)
        if today <= sub.next_expected <= horizon:
            upcoming.append(sub)

    upcoming.sort(key=lambda s: (s.next_expected, s.display_name))
    ordered_currencies = sorted(monthly_by_currency, key=lambda c: (c != primary, c))
    return {
        "totals": [
            {
                "currency": currency,
                "monthly": monthly_by_currency[currency].quantize(Decimal("0.01")),
                "annual": (monthly_by_currency[currency] * 12).quantize(Decimal("0.01")),
            }
            for currency in ordered_currencies
        ],
        "tracked_count": counts["tracked"],
        "suggested_count": counts["suggested"],
        "cancelled_count": counts["cancelled"],
        "ignored_count": counts["ignored"],
        "upcoming": upcoming,
        "last_scanned_at": last_scanned,
    }


# ---------------------------------------------------------------------------
# Actions
# ---------------------------------------------------------------------------


async def track(
    session: AsyncSession,
    sub: Subscription,
    workspace_id: uuid.UUID,
    user_id: uuid.UUID,
    today: Optional[date] = None,
) -> Subscription:
    """Turn a detected series into a recurring bill and link its charges."""
    if sub.status == "tracked" and sub.recurring_transaction_id is not None:
        return sub
    if sub.account_id is None:
        raise ValueError("Subscription has no account to attach the bill to")
    today = today or date.today()

    recurring = None
    if sub.recurring_transaction_id is not None:
        recurring = await session.get(RecurringTransaction, sub.recurring_transaction_id)
    if recurring is None:
        start = next_occurrence_on_or_after(sub.next_expected, sub.cadence, today)
        data = RecurringTransactionCreate(
            description=sub.display_name,
            amount=Decimal(sub.amount),
            currency=sub.currency,
            type="debit",
            frequency=sub.cadence,
            start_date=start,
            account_id=sub.account_id,
            category_id=sub.category_id,
            # Charges arrive from the bank; a placeholder would only duplicate them.
            auto_generate=False,
        )
        recurring = await recurring_transaction_service.create_recurring_transaction(
            session, workspace_id, user_id, data
        )
    else:
        recurring.is_active = True
        recurring.end_date = None

    ids = [uuid.UUID(value) for value in (sub.transaction_ids or [])]
    if ids:
        await session.execute(
            update(Transaction)
            .where(
                Transaction.id.in_(ids),
                Transaction.workspace_id == workspace_id,
                Transaction.recurring_transaction_id.is_(None),
            )
            .values(recurring_transaction_id=recurring.id)
        )

    sub.status = "tracked"
    sub.recurring_transaction_id = recurring.id
    sub.cancelled_at = None
    await session.commit()
    await session.refresh(sub)
    return sub


async def ignore(session: AsyncSession, sub: Subscription) -> Subscription:
    sub.status = "ignored"
    await session.commit()
    await session.refresh(sub)
    return sub


async def cancel(
    session: AsyncSession, sub: Subscription, cancelled_at: Optional[date] = None
) -> Subscription:
    """Record that the user cancelled the service; later charges raise an alert."""
    sub.status = "cancelled"
    sub.cancelled_at = cancelled_at or date.today()
    if sub.recurring_transaction_id is not None:
        recurring = await session.get(RecurringTransaction, sub.recurring_transaction_id)
        if recurring is not None:
            recurring.is_active = False
            recurring.end_date = sub.cancelled_at
    await session.commit()
    await session.refresh(sub)
    return sub


async def restore(session: AsyncSession, sub: Subscription) -> Subscription:
    """Undo ignore/cancel: back to tracked when a bill exists, else suggested."""
    sub.cancelled_at = None
    if sub.recurring_transaction_id is not None:
        recurring = await session.get(RecurringTransaction, sub.recurring_transaction_id)
        if recurring is not None:
            recurring.is_active = True
            recurring.end_date = None
        sub.status = "tracked"
    else:
        sub.status = "suggested"
    await session.commit()
    await session.refresh(sub)
    return sub


async def update_subscription(
    session: AsyncSession, sub: Subscription, data: SubscriptionUpdate
) -> Subscription:
    changes = data.model_dump(exclude_unset=True)
    cadence_changed = "cadence" in changes and changes["cadence"] != sub.cadence
    for key, value in changes.items():
        setattr(sub, key, value)
    if cadence_changed:
        sub.next_expected = _next_expected(sub.last_seen, sub.cadence)
    if sub.recurring_transaction_id is not None:
        recurring = await session.get(RecurringTransaction, sub.recurring_transaction_id)
        if recurring is not None:
            if "display_name" in changes:
                recurring.description = sub.display_name
            if "amount" in changes:
                recurring.amount = sub.amount
            if cadence_changed:
                recurring.frequency = sub.cadence
            if "category_id" in changes:
                recurring.category_id = sub.category_id
    await session.commit()
    await session.refresh(sub)
    return sub
