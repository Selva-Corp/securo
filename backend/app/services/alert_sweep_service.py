"""Scheduled alert producers (fork feature).

Runs from the hourly Celery sweep. Everything here is idempotent by way of
`notify()`'s dedupe keys, so the sweep can run as often as it likes: the
daily producers key on the day or month, `large_transaction` on the row.
"""

from __future__ import annotations

import logging
import uuid
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from typing import Optional
from zoneinfo import ZoneInfo

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.account import Account
from app.models.category import Category
from app.models.recurring_transaction import RecurringTransaction
from app.models.subscription import Subscription
from app.models.transaction import Transaction
from app.models.user import User
from app.services import budget_service
from app.services import notification_kinds as kinds
from app.services._query_filters import counts_as_pnl
from app.services.notification_service import get_preferences, notify
from app.services.notification_templates import format_amount
from app.services.recurring_match_service import _REAL_SOURCES
from app.services.recurring_transaction_service import adjust_weekend_date

logger = logging.getLogger(__name__)

CASH_ACCOUNT_TYPES = ("checking", "savings", "cash")
LARGE_TRANSACTION_LOOKBACK = timedelta(hours=36)
UNUSUAL_SPEND_MIN_AMOUNT = Decimal("50")


def user_local_hour(preferences: Optional[dict], now: datetime) -> int:
    tz_name = (preferences or {}).get("timezone") or "UTC"
    try:
        return now.astimezone(ZoneInfo(tz_name)).hour
    except Exception:
        return now.astimezone(timezone.utc).hour


def user_local_date(preferences: Optional[dict], now: datetime) -> date:
    tz_name = (preferences or {}).get("timezone") or "UTC"
    try:
        return now.astimezone(ZoneInfo(tz_name)).date()
    except Exception:
        return now.astimezone(timezone.utc).date()


async def sweep_workspace(
    session: AsyncSession,
    workspace_id: uuid.UUID,
    user_id: uuid.UUID,
    now: Optional[datetime] = None,
    *,
    force_daily: bool = False,
) -> int:
    """Run every producer that is due for this user/workspace. Commits."""
    now = now or datetime.now(timezone.utc)
    prefs = await get_preferences(session, workspace_id, user_id)
    assert prefs is not None
    user_prefs = await session.scalar(select(User.preferences).where(User.id == user_id))
    today = user_local_date(user_prefs, now)
    created = 0

    created += await large_transactions(session, workspace_id, user_id, prefs.large_transaction_amount, now)

    if force_daily or user_local_hour(user_prefs, now) == prefs.daily_digest_hour:
        created += await upcoming_bills(session, workspace_id, user_id, today, prefs.reminder_days_before)
        created += await low_balances(session, workspace_id, user_id, today, prefs.low_balance_amount)
        created += await budgets_exceeded(session, workspace_id, user_id, today)
        created += await unusual_spend(session, workspace_id, user_id, today, prefs.unusual_spend_pct)

    await session.commit()
    return created


async def upcoming_bills(
    session: AsyncSession, workspace_id: uuid.UUID, user_id: uuid.UUID, today: date, days_before: int
) -> int:
    horizon = today + timedelta(days=max(0, days_before))
    created = 0
    bills = (
        await session.execute(
            select(RecurringTransaction).where(
                RecurringTransaction.workspace_id == workspace_id,
                RecurringTransaction.is_active.is_(True),
                RecurringTransaction.type == "debit",
                RecurringTransaction.next_occurrence <= horizon + timedelta(days=2),
            )
        )
    ).scalars().all()
    for bill in bills:
        due = adjust_weekend_date(bill.next_occurrence, bill.weekend_adjustment)
        if not (today <= due <= horizon):
            continue
        if await notify(
            session, workspace_id=workspace_id, user_id=user_id, kind=kinds.UPCOMING_BILL,
            payload={
                "name": bill.description,
                "amount": format_amount(bill.amount, bill.currency),
                "date": due.isoformat(),
                "recurring_id": str(bill.id),
            },
            dedupe_key=f"upcoming_bill:{bill.id}:{due.isoformat()}",
            entity_type="recurring", entity_id=bill.id,
        ):
            created += 1

    # Tracked subscriptions that were not turned into bills still deserve a heads-up.
    subs = (
        await session.execute(
            select(Subscription).where(
                Subscription.workspace_id == workspace_id,
                Subscription.status == "tracked",
                Subscription.recurring_transaction_id.is_(None),
                Subscription.next_expected >= today,
                Subscription.next_expected <= horizon,
            )
        )
    ).scalars().all()
    for sub in subs:
        if await notify(
            session, workspace_id=workspace_id, user_id=user_id, kind=kinds.UPCOMING_BILL,
            payload={
                "name": sub.display_name,
                "amount": format_amount(sub.amount, sub.currency),
                "date": sub.next_expected.isoformat(),
                "subscription_id": str(sub.id),
            },
            dedupe_key=f"upcoming_sub:{sub.id}:{sub.next_expected.isoformat()}",
            entity_type="subscription", entity_id=sub.id,
        ):
            created += 1
    return created


async def low_balances(
    session: AsyncSession, workspace_id: uuid.UUID, user_id: uuid.UUID, today: date, threshold: Decimal
) -> int:
    if threshold is None or threshold <= 0:
        return 0
    accounts = (
        await session.execute(
            select(Account).where(
                Account.workspace_id == workspace_id,
                Account.is_closed.is_(False),
                Account.type.in_(CASH_ACCOUNT_TYPES),
                Account.balance < threshold,
            )
        )
    ).scalars().all()
    created = 0
    for account in accounts:
        if await notify(
            session, workspace_id=workspace_id, user_id=user_id, kind=kinds.LOW_BALANCE,
            payload={
                "account": account.display_name or account.name,
                "amount": format_amount(account.balance, account.currency),
                "account_id": str(account.id),
            },
            dedupe_key=f"low_balance:{account.id}:{today.isoformat()}",
            entity_type="account", entity_id=account.id,
        ):
            created += 1
    return created


async def budgets_exceeded(
    session: AsyncSession, workspace_id: uuid.UUID, user_id: uuid.UUID, today: date
) -> int:
    month = today.replace(day=1)
    try:
        rows = await budget_service.get_budget_vs_actual(session, workspace_id, user_id, month)
    except Exception:
        logger.exception("budget comparison failed for workspace %s", workspace_id)
        return 0
    created = 0
    for row in rows:
        if row.budget_amount is None or row.budget_amount <= 0:
            continue
        if row.actual_amount <= row.budget_amount:
            continue
        if await notify(
            session, workspace_id=workspace_id, user_id=user_id, kind=kinds.BUDGET_EXCEEDED,
            payload={
                "category": row.category_name,
                "amount": format_amount(row.actual_amount, None),
                "budget": format_amount(row.budget_amount, None),
                "category_id": str(row.category_id),
                "month": month.isoformat()[:7],
            },
            dedupe_key=f"budget_exceeded:{row.category_id}:{month.isoformat()[:7]}",
            entity_type="category", entity_id=row.category_id,
        ):
            created += 1
    return created


def _spend_expr():
    return func.sum(func.coalesce(Transaction.amount_primary, Transaction.amount))


async def _spend_by_category(
    session: AsyncSession, workspace_id: uuid.UUID, start: date, end: date
) -> dict[uuid.UUID, Decimal]:
    result = await session.execute(
        select(Transaction.category_id, _spend_expr())
        .where(
            Transaction.workspace_id == workspace_id,
            Transaction.type == "debit",
            Transaction.status == "posted",
            Transaction.source.in_(_REAL_SOURCES),
            Transaction.category_id.is_not(None),
            Transaction.date >= start,
            Transaction.date < end,
            counts_as_pnl(),
        )
        .group_by(Transaction.category_id)
    )
    return {row[0]: Decimal(str(row[1] or 0)) for row in result.all()}


async def unusual_spend(
    session: AsyncSession, workspace_id: uuid.UUID, user_id: uuid.UUID, today: date, pct: int
) -> int:
    if pct is None or pct <= 0:
        return 0
    month_start = today.replace(day=1)
    # Trailing three full months before this one.
    trailing_start = (month_start - timedelta(days=1)).replace(day=1)
    for _ in range(2):
        trailing_start = (trailing_start - timedelta(days=1)).replace(day=1)
    current = await _spend_by_category(session, workspace_id, month_start, today + timedelta(days=1))
    trailing = await _spend_by_category(session, workspace_id, trailing_start, month_start)
    if not current:
        return 0
    names = {
        row.id: row.name
        for row in (
            await session.execute(select(Category.id, Category.name).where(Category.id.in_(list(current))))
        ).all()
    }
    created = 0
    for category_id, month_to_date in current.items():
        baseline = trailing.get(category_id, Decimal(0)) / 3
        if baseline <= 0 or month_to_date < UNUSUAL_SPEND_MIN_AMOUNT:
            continue
        if month_to_date <= baseline * (1 + Decimal(pct) / 100):
            continue
        percent = int((month_to_date / baseline - 1) * 100)
        if await notify(
            session, workspace_id=workspace_id, user_id=user_id, kind=kinds.UNUSUAL_SPEND,
            payload={
                "category": names.get(category_id, ""),
                "amount": format_amount(month_to_date, None),
                "percent": str(percent),
                "category_id": str(category_id),
                "month": month_start.isoformat()[:7],
            },
            dedupe_key=f"unusual_spend:{category_id}:{month_start.isoformat()[:7]}",
            entity_type="category", entity_id=category_id,
        ):
            created += 1
    return created


async def large_transactions(
    session: AsyncSession, workspace_id: uuid.UUID, user_id: uuid.UUID, threshold: Decimal, now: datetime
) -> int:
    if threshold is None or threshold <= 0:
        return 0
    since = now - LARGE_TRANSACTION_LOOKBACK
    rows = (
        await session.execute(
            select(Transaction, Account.name, Account.display_name)
            .join(Account, Account.id == Transaction.account_id)
            .where(
                Transaction.workspace_id == workspace_id,
                Transaction.type == "debit",
                Transaction.source.in_(_REAL_SOURCES),
                Transaction.created_at >= since,
                func.coalesce(Transaction.amount_primary, Transaction.amount) >= threshold,
                counts_as_pnl(),
            )
        )
    ).all()
    created = 0
    for tx, account_name, account_display in rows:
        if await notify(
            session, workspace_id=workspace_id, user_id=user_id, kind=kinds.LARGE_TRANSACTION,
            payload={
                "name": tx.description,
                "amount": format_amount(tx.amount, tx.currency),
                "date": tx.date.isoformat(),
                "account": account_display or account_name,
                "transaction_id": str(tx.id),
            },
            dedupe_key=f"large_transaction:{tx.id}",
            entity_type="transaction", entity_id=tx.id,
        ):
            created += 1
    return created
