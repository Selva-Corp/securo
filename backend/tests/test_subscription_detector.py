"""Pure tests for the subscription detector (fork feature)."""

import uuid
from datetime import date, timedelta
from decimal import Decimal

from app.services import subscription_detector as det


def _row(day: date, amount="15.99", description="NETFLIX.COM*4X7Q2", **kw) -> det.ChargeRow:
    return det.ChargeRow(
        id=uuid.uuid4(),
        date=day,
        amount=Decimal(amount),
        currency=kw.pop("currency", "USD"),
        description=description,
        **kw,
    )


def _monthly(start: date, months: int, **kw) -> list[det.ChargeRow]:
    rows = []
    for i in range(months):
        month = (start.month - 1 + i) % 12 + 1
        year = start.year + (start.month - 1 + i) // 12
        rows.append(_row(date(year, month, start.day), **kw))
    return rows


TODAY = date(2026, 9, 2)


def test_merchant_key_strips_codes_dates_and_noise():
    assert det.merchant_key("NETFLIX.COM*4X7Q2 09/02") == "NETFLIX"
    assert det.merchant_key("Netflix.com *8KJ21") == "NETFLIX"
    assert det.merchant_key("PAYPAL *SPOTIFY") == "PAYPAL SPOTIFY"
    assert det.merchant_key("POS PURCHASE AMAZON PRIME 1234") == "AMAZON PRIME"
    assert det.merchant_key("Café Nero 123") == "CAFE NERO"
    assert det.merchant_key("") == ""


def test_merchant_key_keeps_something_for_all_digit_descriptions():
    assert det.merchant_key("12345 67890") != ""


def test_monthly_series_is_detected():
    rows = _monthly(date(2026, 3, 10), 6)
    found = det.detect_series(rows, today=TODAY)
    assert len(found) == 1
    series = found[0]
    assert series.cadence == "monthly"
    assert series.merchant_key == "NETFLIX"
    assert series.display_name == "Netflix"
    assert series.amount == Decimal("15.99")
    assert series.occurrence_count == 6
    assert series.first_seen == date(2026, 3, 10)
    assert series.last_seen == date(2026, 8, 10)
    assert series.next_expected == date(2026, 9, 10)
    assert series.is_lapsed is False
    assert series.confidence >= Decimal("0.9")
    assert len(series.transaction_ids) == 6


def test_drifting_dates_still_match_monthly():
    days = [date(2026, 1, 3), date(2026, 2, 1), date(2026, 3, 5), date(2026, 4, 2), date(2026, 5, 4)]
    found = det.detect_series([_row(d) for d in days], today=date(2026, 5, 20))
    assert len(found) == 1
    assert found[0].cadence == "monthly"


def test_too_few_occurrences_are_ignored():
    rows = _monthly(date(2026, 6, 1), 2)
    assert det.detect_series(rows, today=TODAY) == []


def test_yearly_needs_only_two():
    rows = [_row(date(2024, 9, 1), "99.00", "AMAZON PRIME"), _row(date(2025, 9, 1), "99.00", "AMAZON PRIME")]
    found = det.detect_series(rows, today=date(2025, 10, 1))
    assert len(found) == 1
    assert found[0].cadence == "yearly"
    assert found[0].next_expected == date(2026, 9, 1)


def test_weekly_and_biweekly():
    weekly = [_row(date(2026, 7, 1) + timedelta(weeks=i), "12.00", "BLUE APRON") for i in range(5)]
    biweekly = [_row(date(2026, 6, 5) + timedelta(weeks=2 * i), "40.00", "GYM CLUB") for i in range(5)]
    found = {s.merchant_key: s for s in det.detect_series(weekly + biweekly, today=TODAY)}
    assert found["BLUE APRON"].cadence == "weekly"
    assert found["BLUE APRON"].next_expected == date(2026, 8, 5)
    assert found["GYM CLUB"].cadence == "biweekly"
    assert found["GYM CLUB"].next_expected == date(2026, 8, 14)


def test_irregular_gaps_are_not_a_series():
    days = [date(2026, 1, 1), date(2026, 1, 20), date(2026, 3, 15), date(2026, 3, 30), date(2026, 6, 1)]
    assert det.detect_series([_row(d, "30.00", "GROCER") for d in days], today=TODAY) == []


def test_variable_amounts_are_not_a_series():
    rows = _monthly(date(2026, 1, 5), 5, description="SUPERMARKET")
    amounts = ["20.00", "80.00", "35.00", "150.00", "60.00"]
    rows = [det.ChargeRow(**{**r.__dict__, "amount": Decimal(a)}) for r, a in zip(rows, amounts)]
    assert det.detect_series(rows, today=TODAY) == []


def test_price_increase_is_recorded():
    rows = _monthly(date(2026, 1, 15), 4, amount="15.49") + _monthly(date(2026, 5, 15), 3, amount="17.99")
    found = det.detect_series(rows, today=TODAY)
    assert len(found) == 1
    series = found[0]
    assert series.amount == Decimal("17.99")
    assert series.price_changed is True
    assert series.price_history == [
        {"date": "2026-01-15", "amount": "15.49"},
        {"date": "2026-05-15", "amount": "17.99"},
    ]


def test_tiny_amount_jitter_is_not_a_price_change():
    rows = _monthly(date(2026, 1, 15), 3, amount="10.00") + _monthly(date(2026, 4, 15), 2, amount="10.10")
    found = det.detect_series(rows, today=TODAY)
    assert found[0].price_changed is False


def test_lapsed_series():
    rows = _monthly(date(2025, 6, 1), 4)  # last charge 2025-09-01
    found = det.detect_series(rows, today=TODAY)
    assert len(found) == 1
    assert found[0].is_lapsed is True
    assert found[0].confidence < Decimal("0.95")


def test_same_day_duplicates_are_collapsed():
    rows = _monthly(date(2026, 3, 10), 4)
    rows.append(_row(date(2026, 4, 11)))  # retry one day after the April charge
    found = det.detect_series(rows, today=TODAY)
    assert len(found) == 1
    assert found[0].occurrence_count == 4


def test_payee_link_groups_across_description_drift():
    payee = uuid.uuid4()
    rows = [
        _row(date(2026, 1, 1), description="SPOTIFY AB", payee_id=payee),
        _row(date(2026, 2, 1), description="Spotify Premium", payee_id=payee),
        _row(date(2026, 3, 1), description="SPOTIFY*PREM 12", payee_id=payee),
        _row(date(2026, 4, 1), description="SPOTIFY", payee_id=payee),
    ]
    found = det.detect_series(rows, today=date(2026, 4, 20))
    assert len(found) == 1
    assert found[0].merchant_key == f"payee:{payee}"
    assert found[0].payee_id == payee


def test_currency_splits_series():
    usd = _monthly(date(2026, 1, 1), 4, description="ADOBE")
    eur = _monthly(date(2026, 1, 3), 4, description="ADOBE", currency="EUR")
    found = det.detect_series(usd + eur, today=TODAY)
    assert sorted(s.currency for s in found) == ["EUR", "USD"]


def test_linked_recurring_bill_is_reported():
    bill = uuid.uuid4()
    rows = _monthly(date(2026, 2, 1), 5, recurring_transaction_id=bill)
    found = det.detect_series(rows, today=TODAY)
    assert found[0].linked_recurring_id == bill


def test_most_common_category_and_latest_account_win():
    cat_a, cat_b = uuid.uuid4(), uuid.uuid4()
    acc_old, acc_new = uuid.uuid4(), uuid.uuid4()
    rows = [
        _row(date(2026, 1, 1), category_id=cat_a, account_id=acc_old),
        _row(date(2026, 2, 1), category_id=cat_a, account_id=acc_old),
        _row(date(2026, 3, 1), category_id=cat_b, account_id=acc_new),
        _row(date(2026, 4, 1), category_id=cat_a, account_id=acc_new),
    ]
    found = det.detect_series(rows, today=date(2026, 4, 15))
    assert found[0].category_id == cat_a
    assert found[0].account_id == acc_new


def test_sorting_puts_active_high_confidence_first():
    active = _monthly(date(2026, 3, 1), 6, description="ACTIVE ONE")
    lapsed = _monthly(date(2025, 1, 1), 6, description="OLD ONE")
    found = det.detect_series(active + lapsed, today=TODAY)
    assert [s.merchant_key for s in found] == ["ACTIVE ONE", "OLD ONE"]
