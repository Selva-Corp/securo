"""Alerts and notifications (fork feature): service, sweep, ntfy channel, API."""

import uuid
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

import httpx
import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.account import Account
from app.models.budget import Budget
from app.models.notification import Notification
from app.models.recurring_transaction import RecurringTransaction
from app.models.transaction import Transaction
from app.services import alert_sweep_service, notification_kinds as kinds, notification_service
from app.services.channels import ntfy
from app.services.notification_templates import render


def _lang(user) -> str | None:
    return (user.preferences or {}).get("language")


def _digest_now(user, hour: int) -> datetime:
    """A UTC instant at which the fixture user's local clock reads `hour`."""
    for h in range(24):
        candidate = NOW.replace(hour=h)
        if alert_sweep_service.user_local_hour(user.preferences, candidate) == hour:
            return candidate
    raise AssertionError("no matching hour")

TODAY = date(2026, 9, 2)
NOW = datetime(2026, 9, 2, 12, 0, tzinfo=timezone.utc)


@pytest_asyncio.fixture
async def account(session: AsyncSession, test_user, test_workspace) -> Account:
    acc = Account(
        id=uuid.uuid4(), user_id=test_user.id, workspace_id=test_workspace.id,
        name="Checking", type="checking", balance=Decimal("80"), currency="USD",
    )
    session.add(acc)
    await session.commit()
    await session.refresh(acc)
    return acc


async def _notify(session, test_workspace, test_user, kind=kinds.LOW_BALANCE, key="k1", **payload):
    payload = {"account": "Checking", "amount": "80.00 USD", **payload}
    n = await notification_service.notify(
        session, workspace_id=test_workspace.id, user_id=test_user.id,
        kind=kind, payload=payload, dedupe_key=key,
    )
    await session.commit()
    return n


# ---------------------------------------------------------------------------
# templates + channel
# ---------------------------------------------------------------------------


def test_render_uses_language_and_tolerates_missing_placeholders():
    title, body = render(kinds.UPCOMING_BILL, {"name": "Rent", "amount": "1,200.00 USD", "date": "2026-09-05"}, "en")
    assert title == "Rent is due 2026-09-05"
    assert "1,200.00 USD" in body
    title_pt, _ = render(kinds.UPCOMING_BILL, {"name": "Aluguel", "amount": "1.200", "date": "05/09"}, "pt-BR")
    assert title_pt == "Aluguel vence 05/09"
    title_missing, _ = render(kinds.LOW_BALANCE, {}, "de")
    assert title_missing == "Low balance: {account}"
    _, body_cadence = render(kinds.NEW_SUBSCRIPTION, {"name": "X", "amount": "9", "cadence": "biweekly"}, "en")
    assert "every 2 weeks" in body_cadence


@pytest.mark.asyncio
async def test_ntfy_send_posts_json_and_raises_on_error():
    seen: dict = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["url"] = str(request.url)
        seen["auth"] = request.headers.get("authorization")
        seen["json"] = request.read()
        return httpx.Response(200, json={"id": "abc"})

    await ntfy.send(
        "ntfy.sh", "securo-justin", "tok", title="Título", body="corpo", tags=["warning"],
        click_url="http://app/notifications", priority=4, transport=httpx.MockTransport(handler),
    )
    assert seen["url"] == "https://ntfy.sh"
    assert seen["auth"] == "Bearer tok"
    assert b'"topic": "securo-justin"' in seen["json"] or b'"topic":"securo-justin"' in seen["json"]

    with pytest.raises(ntfy.NtfyError):
        await ntfy.send("https://ntfy.sh", "t", None, title="a", body="b",
                        transport=httpx.MockTransport(lambda r: httpx.Response(403, text="forbidden")))
    with pytest.raises(ntfy.NtfyError):
        await ntfy.send("", "t", None, title="a", body="b")


# ---------------------------------------------------------------------------
# service
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_notify_dedupes_and_respects_kind_preference(session, test_user, test_workspace):
    first = await _notify(session, test_workspace, test_user)
    assert first is not None
    assert first.title == render(kinds.LOW_BALANCE, {"account": "Checking"}, _lang(test_user))[0]
    assert first.delivered_channels == ["in_app"]
    assert await _notify(session, test_workspace, test_user) is None  # same key
    assert await notification_service.unread_count(session, test_workspace.id, test_user.id) == 1

    await notification_service.update_preferences(
        session, test_workspace.id, test_user.id, {"kinds": {kinds.LOW_BALANCE: False}}
    )
    assert await _notify(session, test_workspace, test_user, key="k2") is None
    assert await _notify(session, test_workspace, test_user, kind=kinds.LARGE_TRANSACTION, key="k3", name="TV", date="2026-09-01") is not None


@pytest.mark.asyncio
async def test_preferences_encrypt_token_and_hide_it(session, test_user, test_workspace):
    prefs = await notification_service.update_preferences(
        session, test_workspace.id, test_user.id,
        {"ntfy_enabled": True, "ntfy_topic": "justin-securo", "ntfy_token": "tk_secret"},
    )
    assert prefs.ntfy_token_encrypted and "tk_secret" not in prefs.ntfy_token_encrypted
    assert notification_service.ntfy_token(prefs) == "tk_secret"
    prefs = await notification_service.update_preferences(
        session, test_workspace.id, test_user.id, {"clear_ntfy_token": True}
    )
    assert prefs.ntfy_token_encrypted is None


@pytest.mark.asyncio
async def test_deliver_pending_marks_channel_and_stops_after_max_attempts(session, test_user, test_workspace, monkeypatch):
    await notification_service.update_preferences(
        session, test_workspace.id, test_user.id, {"ntfy_enabled": True, "ntfy_topic": "t"}
    )
    n = await _notify(session, test_workspace, test_user)
    assert n is not None

    calls = {"n": 0}

    async def fake_send(*args, **kwargs):
        calls["n"] += 1
        if calls["n"] == 1:
            raise ntfy.NtfyError("down")

    monkeypatch.setattr(ntfy, "send", fake_send)
    assert await notification_service.deliver_pending(session) == 0
    await session.refresh(n)
    assert n.delivery_attempts == 1 and "ntfy" not in n.delivered_channels
    assert await notification_service.deliver_pending(session) == 1
    await session.refresh(n)
    assert n.delivered_channels == ["in_app", "ntfy"]
    assert await notification_service.deliver_pending(session) == 0  # already delivered
    assert calls["n"] == 2


@pytest.mark.asyncio
async def test_inbox_ordering_and_read_all(session, test_user, test_workspace):
    a = await _notify(session, test_workspace, test_user, key="a")
    b = await _notify(session, test_workspace, test_user, key="b", kind=kinds.LARGE_TRANSACTION, name="TV", date="2026-09-01")
    await notification_service.mark_read(session, test_workspace.id, test_user.id, b.id)
    rows = await notification_service.list_notifications(session, test_workspace.id, test_user.id)
    assert [r.id for r in rows] == [a.id, b.id]  # unread first
    assert await notification_service.mark_all_read(session, test_workspace.id, test_user.id) == 1
    assert await notification_service.unread_count(session, test_workspace.id, test_user.id) == 0


# ---------------------------------------------------------------------------
# sweep producers
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_sweep_upcoming_bill_low_balance_and_large_transaction(session, test_user, test_workspace, account):
    bill = RecurringTransaction(
        user_id=test_user.id, workspace_id=test_workspace.id, account_id=account.id,
        description="Rent", amount=Decimal("1200"), currency="USD", type="debit",
        frequency="monthly", start_date=date(2026, 1, 5), next_occurrence=date(2026, 9, 5),
    )
    far = RecurringTransaction(
        user_id=test_user.id, workspace_id=test_workspace.id, account_id=account.id,
        description="Insurance", amount=Decimal("300"), currency="USD", type="debit",
        frequency="yearly", start_date=date(2026, 1, 20), next_occurrence=date(2026, 9, 20),
    )
    big = Transaction(
        user_id=test_user.id, workspace_id=test_workspace.id, account_id=account.id,
        description="APPLE STORE", amount=Decimal("1499"), currency="USD", date=TODAY,
        type="debit", source="sync", status="posted", external_id="big", created_at=NOW - timedelta(hours=1),
    )
    small = Transaction(
        user_id=test_user.id, workspace_id=test_workspace.id, account_id=account.id,
        description="COFFEE", amount=Decimal("4"), currency="USD", date=TODAY,
        type="debit", source="sync", status="posted", external_id="small", created_at=NOW - timedelta(hours=1),
    )
    session.add_all([bill, far, big, small])
    await session.commit()

    created = await alert_sweep_service.sweep_workspace(
        session, test_workspace.id, test_user.id, now=NOW, force_daily=True
    )
    rows = await notification_service.list_notifications(session, test_workspace.id, test_user.id)
    by_kind = {r.kind: r for r in rows}
    assert created == 3
    assert by_kind[kinds.UPCOMING_BILL].payload["name"] == "Rent"
    assert by_kind[kinds.LOW_BALANCE].payload["account"] == "Checking"
    assert by_kind[kinds.LARGE_TRANSACTION].payload["name"] == "APPLE STORE"

    # Second run the same day is a no-op thanks to dedupe keys.
    assert await alert_sweep_service.sweep_workspace(
        session, test_workspace.id, test_user.id, now=NOW, force_daily=True
    ) == 0


@pytest.mark.asyncio
async def test_sweep_daily_producers_only_at_digest_hour(session, test_user, test_workspace, account):
    # Account balance 80 < 100 threshold, but the user's local hour is not the digest hour.
    created = await alert_sweep_service.sweep_workspace(
        session, test_workspace.id, test_user.id, now=_digest_now(test_user, 15)
    )
    assert created == 0
    created = await alert_sweep_service.sweep_workspace(
        session, test_workspace.id, test_user.id, now=_digest_now(test_user, 8)
    )
    assert created == 1


@pytest.mark.asyncio
async def test_sweep_budget_exceeded_and_unusual_spend(session, test_user, test_workspace, account, test_categories):
    cat = test_categories[0]
    session.add(Budget(user_id=test_user.id, workspace_id=test_workspace.id, category_id=cat.id,
                       amount=Decimal("100"), month=TODAY.replace(day=1)))
    # Trailing three months: 60/month in this category. This month: 200.
    for i, month in enumerate([6, 7, 8]):
        session.add(Transaction(
            user_id=test_user.id, workspace_id=test_workspace.id, account_id=account.id, category_id=cat.id,
            description=f"DINING {i}", amount=Decimal("60"), currency="USD", date=date(2026, month, 10),
            type="debit", source="sync", status="posted", external_id=f"d{i}", created_at=NOW - timedelta(days=60),
        ))
    session.add(Transaction(
        user_id=test_user.id, workspace_id=test_workspace.id, account_id=account.id, category_id=cat.id,
        description="DINING NOW", amount=Decimal("200"), currency="USD", date=TODAY,
        type="debit", source="sync", status="posted", external_id="dn", created_at=NOW - timedelta(days=3),
    ))
    await session.commit()

    await alert_sweep_service.sweep_workspace(session, test_workspace.id, test_user.id, now=NOW, force_daily=True)
    rows = await notification_service.list_notifications(session, test_workspace.id, test_user.id)
    kinds_seen = {r.kind for r in rows}
    assert kinds.BUDGET_EXCEEDED in kinds_seen
    assert kinds.UNUSUAL_SPEND in kinds_seen
    unusual = next(r for r in rows if r.kind == kinds.UNUSUAL_SPEND)
    assert unusual.payload["percent"] == "233"


# ---------------------------------------------------------------------------
# API
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_api_inbox_and_preferences(client, auth_headers, session, test_user, test_workspace):
    n = await _notify(session, test_workspace, test_user)

    response = await client.get("/api/notifications/unread-count", headers=auth_headers)
    assert response.status_code == 200 and response.json()["count"] == 1

    response = await client.get("/api/notifications", headers=auth_headers)
    assert response.status_code == 200
    assert response.json()[0]["title"] == render(kinds.LOW_BALANCE, {"account": "Checking"}, _lang(test_user))[0]

    response = await client.post(f"/api/notifications/{n.id}/read", headers=auth_headers)
    assert response.status_code == 200 and response.json()["read_at"] is not None
    assert (await client.post(f"/api/notifications/{uuid.uuid4()}/read", headers=auth_headers)).status_code == 404

    response = await client.get("/api/notifications/preferences", headers=auth_headers)
    assert response.status_code == 200
    assert response.json()["reminder_days_before"] == 3
    assert response.json()["has_ntfy_token"] is False

    response = await client.put(
        "/api/notifications/preferences",
        json={"ntfy_enabled": True, "ntfy_topic": "justin", "ntfy_token": "secret", "reminder_days_before": 5,
              "kinds": {"low_balance": False}},
        headers=auth_headers,
    )
    assert response.status_code == 200
    body = response.json()
    assert body["has_ntfy_token"] is True and "secret" not in str(body)
    assert body["reminder_days_before"] == 5 and body["kinds"] == {"low_balance": False}

    response = await client.post("/api/notifications/read-all", headers=auth_headers)
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_api_test_push_reports_configuration_errors(client, auth_headers):
    response = await client.post("/api/notifications/test", headers=auth_headers)
    assert response.status_code == 200
    assert response.json() == {"ok": False, "error": "ntfy is not configured"}


@pytest.mark.asyncio
async def test_notifications_are_per_user(client, viewer_auth_headers, session, test_user, test_workspace):
    await _notify(session, test_workspace, test_user)
    response = await client.get("/api/notifications", headers=viewer_auth_headers)
    assert response.status_code == 200 and response.json() == []
    assert await session.scalar(
        __import__("sqlalchemy").select(__import__("sqlalchemy").func.count(Notification.id))
    ) == 1
