"""Phone home-screen summary (fork feature)."""

import uuid
from datetime import date, timedelta
from decimal import Decimal

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.account import Account
from app.models.budget import Budget
from app.models.recurring_transaction import RecurringTransaction
from app.models.subscription import Subscription
from app.models.transaction import Transaction
from app.services import mobile_dashboard_service as svc


@pytest_asyncio.fixture
async def cash_and_card(session: AsyncSession, test_user, test_workspace):
    checking = Account(
        id=uuid.uuid4(), user_id=test_user.id, workspace_id=test_workspace.id,
        name="Checking", type="checking", balance=Decimal("2500"), currency="USD",
    )
    card = Account(
        id=uuid.uuid4(), user_id=test_user.id, workspace_id=test_workspace.id,
        name="Card", type="credit_card", balance=Decimal("-900"), currency="USD",
    )
    session.add_all([checking, card])
    await session.commit()
    return checking, card


def test_month_end():
    assert svc.month_end(date(2026, 2, 10)) == date(2026, 2, 28)
    assert svc.month_end(date(2028, 2, 1)) == date(2028, 2, 29)
    assert svc.month_end(date(2026, 12, 31)) == date(2026, 12, 31)


@pytest.mark.asyncio
async def test_safe_to_spend_formula(session, test_user, test_workspace, cash_and_card, test_categories):
    checking, _card = cash_and_card
    today = date.today()
    if today.day > 20:
        today = today.replace(day=15)  # keep the fixtures inside the month
    # Opening balance so the manual account walks to 2500 as of today.
    session.add(Transaction(
        user_id=test_user.id, workspace_id=test_workspace.id, account_id=checking.id,
        description="Opening", amount=Decimal("2500"), currency="USD", date=today - timedelta(days=40),
        type="credit", source="manual", status="posted",
    ))
    # Rent due in 3 days (bill), a tracked subscription with no bill, and a
    # budget with 60 left in a category that also holds the rent projection.
    session.add(RecurringTransaction(
        user_id=test_user.id, workspace_id=test_workspace.id, account_id=checking.id,
        category_id=test_categories[0].id, description="Rent", amount=Decimal("1200"), currency="USD",
        type="debit", frequency="monthly", start_date=today - timedelta(days=60),
        next_occurrence=today + timedelta(days=3), auto_generate=False,
    ))
    session.add(Subscription(
        user_id=test_user.id, workspace_id=test_workspace.id, merchant_key="NETFLIX", display_name="Netflix",
        currency="USD", cadence="monthly", amount=Decimal("15"), average_amount=Decimal("15"),
        first_seen=today - timedelta(days=120), last_seen=today - timedelta(days=25),
        next_expected=today + timedelta(days=5), occurrence_count=4, confidence=Decimal("0.9"),
        status="tracked", account_id=checking.id,
    ))
    session.add(Budget(
        user_id=test_user.id, workspace_id=test_workspace.id, category_id=test_categories[1].id,
        amount=Decimal("100"), month=today.replace(day=1),
    ))
    session.add(Transaction(
        user_id=test_user.id, workspace_id=test_workspace.id, account_id=checking.id,
        category_id=test_categories[1].id, description="Dinner", amount=Decimal("40"), currency="USD",
        date=today - timedelta(days=1), type="debit", source="manual", status="posted",
    ))
    await session.commit()

    summary = await svc.get_mobile_summary(session, test_workspace.id, test_user.id, today=today)

    # The fixture user's primary currency may differ; with no FX rows the 1:1 fallback applies.
    assert summary.primary_currency == test_user.primary_currency
    assert summary.cash_balance_primary == Decimal("2460.00")  # 2500 opening - 40 dinner; card excluded
    assert summary.upcoming_bills_primary == Decimal("1215.00")  # rent + Netflix before month end
    assert summary.budget_remaining_primary == Decimal("60.00")
    assert summary.safe_to_spend_primary == Decimal("1185.00")
    assert summary.days_left_in_month == (svc.month_end(today) - today).days + 1
    assert summary.safe_per_day_primary == (Decimal("1185.00") / summary.days_left_in_month).quantize(Decimal("0.01"))
    assert [(i.kind, i.name) for i in summary.upcoming] == [("bill", "Rent"), ("subscription", "Netflix")]


@pytest.mark.asyncio
async def test_api_mobile_summary(client, auth_headers, cash_and_card):
    response = await client.get("/api/dashboard/mobile-summary", headers=auth_headers)
    assert response.status_code == 200
    body = response.json()
    assert set(body) >= {"safe_to_spend_primary", "cash_balance_primary", "upcoming", "days_left_in_month"}
    assert body["upcoming"] == []
