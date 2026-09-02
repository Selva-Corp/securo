"""Subscriptions hub: service + API tests (fork feature)."""

import uuid
from datetime import date, timedelta
from decimal import Decimal

import pytest
import pytest_asyncio
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.account import Account
from app.models.recurring_transaction import RecurringTransaction
from app.models.subscription import Subscription
from app.models.transaction import Transaction
from app.services import subscription_service

TODAY = date(2026, 9, 2)


@pytest_asyncio.fixture
async def account(session: AsyncSession, test_user, test_workspace) -> Account:
    acc = Account(
        id=uuid.uuid4(),
        user_id=test_user.id,
        workspace_id=test_workspace.id,
        name="SubsAcc",
        type="checking",
        balance=Decimal("5000"),
        currency="USD",
    )
    session.add(acc)
    await session.commit()
    await session.refresh(acc)
    return acc


async def _add_charges(session, test_user, test_workspace, account, description, amount, days, **kw):
    rows = []
    for i, day in enumerate(days):
        tx = Transaction(
            user_id=test_user.id,
            workspace_id=test_workspace.id,
            account_id=account.id,
            description=description,
            amount=Decimal(amount),
            currency="USD",
            date=day,
            type=kw.get("type", "debit"),
            source=kw.get("source", "sync"),
            status="posted",
            external_id=f"{description}-{i}",
            category_id=kw.get("category_id"),
        )
        session.add(tx)
        rows.append(tx)
    await session.commit()
    return rows


def _monthly_days(start: date, n: int) -> list[date]:
    out = []
    for i in range(n):
        month = (start.month - 1 + i) % 12 + 1
        year = start.year + (start.month - 1 + i) // 12
        out.append(date(year, month, start.day))
    return out


# ---------------------------------------------------------------------------
# Service
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_scan_creates_suggestions_and_ignores_noise(session, test_user, test_workspace, account):
    await _add_charges(session, test_user, test_workspace, account, "NETFLIX.COM*1A2B", "15.99", _monthly_days(date(2026, 3, 10), 6))
    await _add_charges(session, test_user, test_workspace, account, "COFFEE SHOP", "4.50", [date(2026, 8, 1), date(2026, 8, 3), date(2026, 8, 20)])
    # A recurring placeholder (source=recurring) must not count as a real charge.
    await _add_charges(session, test_user, test_workspace, account, "RENT", "1200", _monthly_days(date(2026, 1, 1), 8), source="recurring")

    result = await subscription_service.scan_workspace(session, test_workspace.id, test_user.id, today=TODAY)

    assert result.created == 1
    assert [e.kind for e in result.events] == ["new_subscription"]
    rows = await subscription_service.list_subscriptions(session, test_workspace.id)
    assert len(rows) == 1
    sub = rows[0]
    assert sub.display_name == "Netflix"
    assert sub.status == "suggested"
    assert sub.cadence == "monthly"
    assert sub.amount == Decimal("15.99")
    assert sub.occurrence_count == 6
    assert sub.next_expected == date(2026, 9, 10)
    assert len(sub.transaction_ids) == 6


@pytest.mark.asyncio
async def test_rescan_preserves_status_and_reports_price_change(session, test_user, test_workspace, account):
    await _add_charges(session, test_user, test_workspace, account, "SPOTIFY", "9.99", _monthly_days(date(2026, 2, 5), 5))
    await subscription_service.scan_workspace(session, test_workspace.id, test_user.id, today=date(2026, 7, 1))
    sub = (await subscription_service.list_subscriptions(session, test_workspace.id))[0]
    await subscription_service.ignore(session, sub)

    await _add_charges(session, test_user, test_workspace, account, "SPOTIFY", "11.99", [date(2026, 7, 5), date(2026, 8, 5)])
    result = await subscription_service.scan_workspace(session, test_workspace.id, test_user.id, today=TODAY)

    assert result.created == 0 and result.updated == 1
    # Ignored rows are refreshed silently: no price event for something dismissed.
    assert result.events == []
    await session.refresh(sub)
    assert sub.status == "ignored"
    assert sub.amount == Decimal("11.99")
    assert sub.occurrence_count == 7

    await subscription_service.restore(session, sub)
    assert sub.status == "suggested"
    await _add_charges(session, test_user, test_workspace, account, "SPOTIFY", "12.99", [date(2026, 9, 5)])
    result = await subscription_service.scan_workspace(session, test_workspace.id, test_user.id, today=date(2026, 9, 10))
    assert [e.kind for e in result.events] == ["price_changed"]
    assert result.events[0].detail == {"old_amount": "11.99", "new_amount": "12.99"}


@pytest.mark.asyncio
async def test_track_creates_bill_and_links_charges(session, test_user, test_workspace, account, test_categories):
    charges = await _add_charges(
        session, test_user, test_workspace, account, "HULU", "7.99",
        _monthly_days(date(2026, 4, 20), 5), category_id=test_categories[0].id,
    )
    await subscription_service.scan_workspace(session, test_workspace.id, test_user.id, today=TODAY)
    sub = (await subscription_service.list_subscriptions(session, test_workspace.id))[0]

    sub = await subscription_service.track(session, sub, test_workspace.id, test_user.id, today=TODAY)

    assert sub.status == "tracked"
    assert sub.recurring_transaction_id is not None
    bill = await session.get(RecurringTransaction, sub.recurring_transaction_id)
    assert bill.description == "Hulu"
    assert bill.frequency == "monthly"
    assert bill.amount == Decimal("7.99")
    assert bill.auto_generate is False
    assert bill.category_id == test_categories[0].id
    assert bill.next_occurrence == date(2026, 9, 20)  # first occurrence on/after today
    linked = await session.execute(
        select(Transaction.recurring_transaction_id).where(Transaction.id.in_([c.id for c in charges]))
    )
    assert {row[0] for row in linked.all()} == {bill.id}

    # Rescanning keeps it tracked and adopts the bill link from the charges.
    result = await subscription_service.scan_workspace(session, test_workspace.id, test_user.id, today=TODAY)
    await session.refresh(sub)
    assert result.events == []
    assert sub.status == "tracked" and sub.recurring_transaction_id == bill.id


@pytest.mark.asyncio
async def test_cancel_then_charge_raises_event_and_restore_reactivates(session, test_user, test_workspace, account):
    await _add_charges(session, test_user, test_workspace, account, "GYM CLUB", "40.00", _monthly_days(date(2026, 3, 1), 6))
    await subscription_service.scan_workspace(session, test_workspace.id, test_user.id, today=TODAY)
    sub = (await subscription_service.list_subscriptions(session, test_workspace.id))[0]
    sub = await subscription_service.track(session, sub, test_workspace.id, test_user.id, today=TODAY)

    sub = await subscription_service.cancel(session, sub, cancelled_at=date(2026, 9, 3))
    assert sub.status == "cancelled"
    bill = await session.get(RecurringTransaction, sub.recurring_transaction_id)
    assert bill.is_active is False and bill.end_date == date(2026, 9, 3)

    await _add_charges(session, test_user, test_workspace, account, "GYM CLUB", "40.00", [date(2026, 10, 1)])
    result = await subscription_service.scan_workspace(session, test_workspace.id, test_user.id, today=date(2026, 10, 5))
    assert [e.kind for e in result.events] == ["charge_after_cancel"]
    assert result.events[0].detail["date"] == "2026-10-01"

    sub = await subscription_service.restore(session, sub)
    assert sub.status == "tracked"
    await session.refresh(bill)
    assert bill.is_active is True and bill.end_date is None


@pytest.mark.asyncio
async def test_existing_recurring_bill_appears_as_tracked(session, test_user, test_workspace, account):
    bill = RecurringTransaction(
        user_id=test_user.id, workspace_id=test_workspace.id, account_id=account.id,
        description="Internet", amount=Decimal("60.00"), currency="USD", type="debit",
        frequency="monthly", start_date=date(2026, 1, 15), next_occurrence=date(2026, 9, 15),
    )
    session.add(bill)
    await session.commit()
    txs = await _add_charges(session, test_user, test_workspace, account, "COMCAST", "60.00", _monthly_days(date(2026, 2, 15), 7))
    for tx in txs:
        tx.recurring_transaction_id = bill.id
    await session.commit()

    result = await subscription_service.scan_workspace(session, test_workspace.id, test_user.id, today=TODAY)
    assert result.events == []  # nothing new to announce: the user already tracks it
    sub = (await subscription_service.list_subscriptions(session, test_workspace.id))[0]
    assert sub.status == "tracked" and sub.recurring_transaction_id == bill.id


@pytest.mark.asyncio
async def test_stale_suggestions_are_removed_on_rescan(session, test_user, test_workspace, account):
    txs = await _add_charges(session, test_user, test_workspace, account, "TRIAL BOX", "20.00", _monthly_days(date(2026, 4, 1), 4))
    await subscription_service.scan_workspace(session, test_workspace.id, test_user.id, today=TODAY)
    assert len(await subscription_service.list_subscriptions(session, test_workspace.id)) == 1
    for tx in txs[1:]:
        await session.delete(tx)
    await session.commit()
    result = await subscription_service.scan_workspace(session, test_workspace.id, test_user.id, today=TODAY)
    assert result.removed == 1
    assert await subscription_service.list_subscriptions(session, test_workspace.id) == []


@pytest.mark.asyncio
async def test_summary_totals_and_upcoming(session, test_user, test_workspace, account):
    await _add_charges(session, test_user, test_workspace, account, "NETFLIX", "15.00", _monthly_days(date(2026, 3, 10), 6))
    await _add_charges(session, test_user, test_workspace, account, "AMAZON PRIME", "120.00", [date(2024, 9, 20), date(2025, 9, 20)])
    await _add_charges(session, test_user, test_workspace, account, "OLD MAG", "30.00", _monthly_days(date(2025, 1, 1), 5))  # lapsed
    await subscription_service.scan_workspace(session, test_workspace.id, test_user.id, today=TODAY)

    summary = await subscription_service.get_summary(session, test_workspace.id, today=TODAY)
    assert summary["suggested_count"] == 3
    assert summary["totals"] == [{"currency": "USD", "monthly": Decimal("25.00"), "annual": Decimal("300.00")}]
    assert [u.display_name for u in summary["upcoming"]] == ["Netflix", "Amazon Prime"]


def test_monthly_equivalent():
    assert subscription_service.monthly_equivalent(Decimal("12"), "yearly") == Decimal("1.00")
    assert subscription_service.monthly_equivalent(Decimal("10"), "weekly") == Decimal("43.33")
    assert subscription_service.monthly_equivalent(Decimal("30"), "quarterly") == Decimal("10.00")
    assert subscription_service.monthly_equivalent(Decimal("50"), "biweekly") == Decimal("108.33")


# ---------------------------------------------------------------------------
# API
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_api_scan_list_detail_and_actions(client, auth_headers, session, test_user, test_workspace, account):
    await _add_charges(session, test_user, test_workspace, account, "DISNEY PLUS", "10.99", _monthly_days(date.today() - timedelta(days=150), 5))

    response = await client.post("/api/subscriptions/scan", headers=auth_headers)
    assert response.status_code == 200
    assert response.json()["created"] == 1

    response = await client.get("/api/subscriptions", headers=auth_headers)
    assert response.status_code == 200
    rows = response.json()
    assert len(rows) == 1
    sub = rows[0]
    assert sub["display_name"] == "Disney Plus"
    assert sub["status"] == "suggested"
    assert sub["monthly_equivalent"] == "10.99"
    assert sub["is_lapsed"] is False

    response = await client.get(f"/api/subscriptions/{sub['id']}", headers=auth_headers)
    assert response.status_code == 200
    assert len(response.json()["charges"]) == 5

    response = await client.get("/api/subscriptions/summary", headers=auth_headers)
    assert response.status_code == 200
    assert response.json()["suggested_count"] == 1
    assert response.json()["totals"][0]["monthly"] == "10.99"

    response = await client.patch(
        f"/api/subscriptions/{sub['id']}", json={"display_name": "Disney+"}, headers=auth_headers
    )
    assert response.status_code == 200 and response.json()["display_name"] == "Disney+"

    response = await client.post(f"/api/subscriptions/{sub['id']}/track", headers=auth_headers)
    assert response.status_code == 200
    assert response.json()["status"] == "tracked"
    assert response.json()["recurring_transaction_id"] is not None

    response = await client.post(
        f"/api/subscriptions/{sub['id']}/cancel", json={"cancelled_at": date.today().isoformat()}, headers=auth_headers
    )
    assert response.status_code == 200 and response.json()["status"] == "cancelled"

    response = await client.post(f"/api/subscriptions/{sub['id']}/restore", headers=auth_headers)
    assert response.status_code == 200 and response.json()["status"] == "tracked"

    response = await client.post(f"/api/subscriptions/{sub['id']}/ignore", headers=auth_headers)
    assert response.status_code == 200 and response.json()["status"] == "ignored"

    response = await client.get("/api/subscriptions?status=ignored", headers=auth_headers)
    assert [r["id"] for r in response.json()] == [sub["id"]]


@pytest.mark.asyncio
async def test_api_unknown_subscription_is_404(client, auth_headers):
    response = await client.get(f"/api/subscriptions/{uuid.uuid4()}", headers=auth_headers)
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_api_viewer_cannot_scan_or_act(client, viewer_auth_headers, session, test_user, test_workspace, account):
    await _add_charges(session, test_user, test_workspace, account, "HBO MAX", "14.99", _monthly_days(date.today() - timedelta(days=150), 5))
    sub = Subscription(
        user_id=test_user.id, workspace_id=test_workspace.id, merchant_key="HBO MAX",
        display_name="Hbo Max", currency="USD", cadence="monthly", amount=Decimal("14.99"),
        average_amount=Decimal("14.99"), first_seen=date(2026, 1, 1), last_seen=date(2026, 8, 1),
        next_expected=date(2026, 9, 1), occurrence_count=5, confidence=Decimal("0.9"),
        account_id=account.id,
    )
    session.add(sub)
    await session.commit()

    assert (await client.get("/api/subscriptions", headers=viewer_auth_headers)).status_code == 200
    assert (await client.post("/api/subscriptions/scan", headers=viewer_auth_headers)).status_code == 403
    assert (await client.post(f"/api/subscriptions/{sub.id}/track", headers=viewer_auth_headers)).status_code == 403
