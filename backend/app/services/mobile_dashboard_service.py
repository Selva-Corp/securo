"""Numbers for the phone home screen (fork feature).

The one figure Rocket Money puts front and centre is "safe to spend": cash
on hand minus the bills still due this month minus what the budgets have
left. Everything here is expressed in the user's primary currency, using
the same balance and projection helpers the desktop dashboard uses, so the
two screens never disagree.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import date, timedelta
from decimal import Decimal
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models.subscription import Subscription
from app.models.user import User
from app.services import budget_service
from app.services.dashboard_service import (
    _account_balance_at,
    _get_open_accounts,
    get_projected_transactions,
)
from app.services.fx_rate_service import convert

CASH_ACCOUNT_TYPES = ("checking", "savings", "cash")
UPCOMING_WINDOW_DAYS = 30
UPCOMING_LIMIT = 8


@dataclass
class UpcomingItem:
    id: str
    kind: str  # "bill" | "subscription"
    name: str
    date: date
    amount: Decimal
    currency: str
    amount_primary: Decimal


@dataclass
class MobileSummary:
    primary_currency: str
    as_of: date
    days_left_in_month: int
    cash_balance_primary: Decimal
    upcoming_bills_primary: Decimal
    budget_remaining_primary: Decimal
    safe_to_spend_primary: Decimal
    safe_per_day_primary: Decimal
    upcoming: list[UpcomingItem] = field(default_factory=list)


def month_end(day: date) -> date:
    first_next = (day.replace(day=28) + timedelta(days=4)).replace(day=1)
    return first_next - timedelta(days=1)


def _q(value: Decimal) -> Decimal:
    return value.quantize(Decimal("0.01"))


async def _cash_balance_primary(
    session: AsyncSession, workspace_id: uuid.UUID, primary: str, today: date
) -> Decimal:
    total = Decimal(0)
    for account in await _get_open_accounts(session, workspace_id):
        if account.type not in CASH_ACCOUNT_TYPES:
            continue
        balance = await _account_balance_at(session, account, today)
        converted, _ = await convert(
            session, Decimal(str(balance)), account.currency, primary, today, allow_fetch=False
        )
        total += converted
    return total


async def _tracked_subscription_items(
    session: AsyncSession, workspace_id: uuid.UUID, primary: str, start: date, end: date
) -> list[UpcomingItem]:
    """Tracked subscriptions that never became bills still count as money going out."""
    rows = (
        await session.execute(
            select(Subscription).where(
                Subscription.workspace_id == workspace_id,
                Subscription.status == "tracked",
                Subscription.recurring_transaction_id.is_(None),
                Subscription.next_expected >= start,
                Subscription.next_expected <= end,
            )
        )
    ).scalars().all()
    items = []
    for sub in rows:
        converted, _ = await convert(
            session, Decimal(sub.amount), sub.currency, primary, start, allow_fetch=False
        )
        items.append(
            UpcomingItem(
                id=str(sub.id), kind="subscription", name=sub.display_name, date=sub.next_expected,
                amount=Decimal(sub.amount), currency=sub.currency, amount_primary=converted,
            )
        )
    return items


async def _projected_items(
    session: AsyncSession, workspace_id: uuid.UUID, user_id: uuid.UUID, start: date, end: date
) -> list[UpcomingItem]:
    projected = await get_projected_transactions(
        session, workspace_id, user_id, from_date=start, to_date=end
    )
    items = []
    for row in projected:
        if row.type != "debit":
            continue
        amount = Decimal(str(row.amount))
        amount_primary = Decimal(str(row.amount_primary)) if row.amount_primary is not None else amount
        items.append(
            UpcomingItem(
                id=row.recurring_id, kind="bill", name=row.description,
                date=date.fromisoformat(row.date), amount=amount, currency=row.currency,
                amount_primary=amount_primary,
            )
        )
    return items


async def get_mobile_summary(
    session: AsyncSession,
    workspace_id: uuid.UUID,
    user_id: uuid.UUID,
    today: Optional[date] = None,
) -> MobileSummary:
    today = today or date.today()
    user = await session.get(User, user_id)
    primary = user.primary_currency if user else get_settings().default_currency
    end_of_month = month_end(today)
    horizon = today + timedelta(days=UPCOMING_WINDOW_DAYS)

    cash = await _cash_balance_primary(session, workspace_id, primary, today)

    # Everything still leaving the cash accounts before the month ends.
    month_items = await _projected_items(session, workspace_id, user_id, today, end_of_month)
    month_items += await _tracked_subscription_items(session, workspace_id, primary, today, end_of_month)
    upcoming_bills = sum((item.amount_primary for item in month_items), Decimal(0))

    # What the budgets still allow. A bill that already counts above also
    # shows up in its category's projection, so use the larger of actual
    # and projected to avoid subtracting the same rent twice.
    budget_remaining = Decimal(0)
    try:
        rows = await budget_service.get_budget_vs_actual(session, workspace_id, user_id, today.replace(day=1))
    except Exception:
        rows = []
    for row in rows:
        if row.budget_amount is None or row.budget_amount <= 0:
            continue
        spent = max(Decimal(row.actual_amount), Decimal(row.projected_amount or 0))
        budget_remaining += max(Decimal(row.budget_amount) - spent, Decimal(0))

    safe = cash - upcoming_bills - budget_remaining
    days_left = max((end_of_month - today).days + 1, 1)

    # The strip on the home screen looks a little further out than the month.
    window_items = await _projected_items(session, workspace_id, user_id, today, horizon)
    window_items += await _tracked_subscription_items(session, workspace_id, primary, today, horizon)
    window_items.sort(key=lambda item: (item.date, item.name))

    return MobileSummary(
        primary_currency=primary,
        as_of=today,
        days_left_in_month=days_left,
        cash_balance_primary=_q(cash),
        upcoming_bills_primary=_q(upcoming_bills),
        budget_remaining_primary=_q(budget_remaining),
        safe_to_spend_primary=_q(safe),
        safe_per_day_primary=_q(max(safe, Decimal(0)) / days_left),
        upcoming=window_items[:UPCOMING_LIMIT],
    )
