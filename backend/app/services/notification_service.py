"""Alerts (fork feature): create, dedupe, list and deliver notifications.

`notify()` is the single entry point producers use. It checks the user's
preferences, refuses duplicates by `dedupe_key`, renders the text in the
user's language and stores the row. Delivery to ntfy happens either right
away (`deliver=True`, used from the worker) or from the minute-ly
`deliver_pending` sweep, so request-path callers never wait on a push.
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Optional

import httpx
from sqlalchemy import func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.crypto import decrypt, encrypt
from app.models.notification import Notification, NotificationPreference
from app.models.user import User
from app.models.workspace import Workspace
from app.services import notification_kinds as kinds
from app.services.channels import ntfy
from app.services.notification_templates import format_amount, render

logger = logging.getLogger(__name__)

MAX_DELIVERY_ATTEMPTS = 5
DELIVERY_WINDOW = timedelta(hours=24)


# ---------------------------------------------------------------------------
# Preferences
# ---------------------------------------------------------------------------


async def get_preferences(
    session: AsyncSession, workspace_id: uuid.UUID, user_id: uuid.UUID, create: bool = True
) -> Optional[NotificationPreference]:
    result = await session.execute(
        select(NotificationPreference).where(
            NotificationPreference.workspace_id == workspace_id,
            NotificationPreference.user_id == user_id,
        )
    )
    prefs = result.scalar_one_or_none()
    if prefs is None and create:
        prefs = NotificationPreference(workspace_id=workspace_id, user_id=user_id)
        session.add(prefs)
        await session.flush()
    return prefs


async def update_preferences(
    session: AsyncSession,
    workspace_id: uuid.UUID,
    user_id: uuid.UUID,
    changes: dict,
) -> NotificationPreference:
    prefs = await get_preferences(session, workspace_id, user_id)
    assert prefs is not None
    token = changes.pop("ntfy_token", None)
    clear_token = changes.pop("clear_ntfy_token", False)
    for key, value in changes.items():
        if value is not None and hasattr(prefs, key):
            setattr(prefs, key, value)
    if clear_token:
        prefs.ntfy_token_encrypted = None
    elif token:
        prefs.ntfy_token_encrypted = encrypt(token)
    await session.commit()
    await session.refresh(prefs)
    return prefs


def ntfy_token(prefs: NotificationPreference) -> Optional[str]:
    if not prefs.ntfy_token_encrypted:
        return None
    try:
        return decrypt(prefs.ntfy_token_encrypted)
    except Exception:
        logger.warning("Could not decrypt ntfy token for preference %s", prefs.id)
        return None


def ntfy_ready(prefs: NotificationPreference) -> bool:
    return bool(prefs.ntfy_enabled and prefs.ntfy_server_url and prefs.ntfy_topic)


# ---------------------------------------------------------------------------
# Creating notifications
# ---------------------------------------------------------------------------


async def _user_language(session: AsyncSession, user_id: uuid.UUID) -> Optional[str]:
    prefs = await session.scalar(select(User.preferences).where(User.id == user_id))
    return (prefs or {}).get("language") if isinstance(prefs, dict) else None


def click_url(kind: str) -> str:
    settings = get_settings()
    base = (getattr(settings, "notification_click_base_url", "") or settings.frontend_url).rstrip("/")
    return base + kinds.CLICK_PATH.get(kind, "/notifications")


async def notify(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    user_id: uuid.UUID,
    kind: str,
    payload: dict,
    dedupe_key: str,
    entity_type: Optional[str] = None,
    entity_id: Optional[uuid.UUID] = None,
    deliver: bool = False,
) -> Optional[Notification]:
    """Store an alert unless the kind is off or the key was seen. Flushes only."""
    prefs = await get_preferences(session, workspace_id, user_id)
    assert prefs is not None
    if kind != kinds.TEST and not prefs.kind_enabled(kind):
        return None
    if not prefs.in_app_enabled and not ntfy_ready(prefs):
        return None

    exists = await session.scalar(
        select(Notification.id).where(
            Notification.workspace_id == workspace_id,
            Notification.user_id == user_id,
            Notification.dedupe_key == dedupe_key,
        )
    )
    if exists is not None:
        return None

    title, body = render(kind, payload, await _user_language(session, user_id))
    notification = Notification(
        workspace_id=workspace_id,
        user_id=user_id,
        kind=kind,
        title=title,
        body=body,
        payload=payload,
        entity_type=entity_type,
        entity_id=entity_id,
        dedupe_key=dedupe_key[:200],
        delivered_channels=["in_app"] if prefs.in_app_enabled else [],
    )
    session.add(notification)
    try:
        await session.flush()
    except IntegrityError:
        # Two producers raced on the same key; the first one wins.
        await session.rollback()
        return None

    if deliver and ntfy_ready(prefs):
        await _deliver_ntfy(notification, prefs)
    return notification


async def _deliver_ntfy(
    notification: Notification,
    prefs: NotificationPreference,
    transport: Optional[httpx.AsyncBaseTransport] = None,
) -> Optional[str]:
    """Push one notification; returns an error string on failure."""
    notification.delivery_attempts = (notification.delivery_attempts or 0) + 1
    try:
        await ntfy.send(
            prefs.ntfy_server_url,
            prefs.ntfy_topic or "",
            ntfy_token(prefs),
            title=notification.title,
            body=notification.body,
            tags=kinds.NTFY_TAGS.get(notification.kind),
            click_url=click_url(notification.kind),
            priority=kinds.NTFY_PRIORITY.get(notification.kind, 3),
            transport=transport,
        )
    except ntfy.NtfyError as exc:
        logger.warning("ntfy delivery failed for notification %s: %s", notification.id, exc)
        return str(exc)
    channels = list(notification.delivered_channels or [])
    if "ntfy" not in channels:
        channels.append("ntfy")
    notification.delivered_channels = channels
    return None


async def deliver_pending(session: AsyncSession) -> int:
    """Push recent notifications that have not reached ntfy yet."""
    since = datetime.now(timezone.utc) - DELIVERY_WINDOW
    result = await session.execute(
        select(Notification, NotificationPreference)
        .join(
            NotificationPreference,
            (NotificationPreference.workspace_id == Notification.workspace_id)
            & (NotificationPreference.user_id == Notification.user_id),
        )
        .where(
            NotificationPreference.ntfy_enabled.is_(True),
            Notification.created_at >= since,
            Notification.delivery_attempts < MAX_DELIVERY_ATTEMPTS,
        )
        .order_by(Notification.created_at)
    )
    sent = 0
    for notification, prefs in result.all():
        if "ntfy" in (notification.delivered_channels or []) or not ntfy_ready(prefs):
            continue
        if await _deliver_ntfy(notification, prefs) is None:
            sent += 1
    await session.commit()
    return sent


async def send_test(
    session: AsyncSession,
    workspace_id: uuid.UUID,
    user_id: uuid.UUID,
    transport: Optional[httpx.AsyncBaseTransport] = None,
) -> tuple[bool, Optional[str]]:
    """Push a test message right now and report the outcome to the caller."""
    prefs = await get_preferences(session, workspace_id, user_id)
    assert prefs is not None
    if not ntfy_ready(prefs):
        return False, "ntfy is not configured"
    workspace = await session.get(Workspace, workspace_id)
    title, body = render(
        kinds.TEST,
        {"workspace": workspace.name if workspace else "Securo"},
        await _user_language(session, user_id),
    )
    probe = Notification(
        workspace_id=workspace_id, user_id=user_id, kind=kinds.TEST, title=title, body=body,
        payload={}, dedupe_key=f"test:{uuid.uuid4()}", delivered_channels=[],
    )
    error = await _deliver_ntfy(probe, prefs, transport=transport)
    return error is None, error


# ---------------------------------------------------------------------------
# Inbox
# ---------------------------------------------------------------------------


async def list_notifications(
    session: AsyncSession,
    workspace_id: uuid.UUID,
    user_id: uuid.UUID,
    *,
    unread_only: bool = False,
    limit: int = 50,
    before: Optional[datetime] = None,
) -> list[Notification]:
    query = select(Notification).where(
        Notification.workspace_id == workspace_id,
        Notification.user_id == user_id,
        Notification.kind != kinds.TEST,
    )
    if unread_only:
        query = query.where(Notification.read_at.is_(None))
    if before is not None:
        query = query.where(Notification.created_at < before)
    query = query.order_by(Notification.read_at.is_not(None), Notification.created_at.desc()).limit(limit)
    return list((await session.execute(query)).scalars().all())


async def unread_count(session: AsyncSession, workspace_id: uuid.UUID, user_id: uuid.UUID) -> int:
    return int(
        await session.scalar(
            select(func.count(Notification.id)).where(
                Notification.workspace_id == workspace_id,
                Notification.user_id == user_id,
                Notification.read_at.is_(None),
            )
        )
        or 0
    )


async def mark_read(
    session: AsyncSession, workspace_id: uuid.UUID, user_id: uuid.UUID, notification_id: uuid.UUID
) -> Optional[Notification]:
    notification = await session.scalar(
        select(Notification).where(
            Notification.id == notification_id,
            Notification.workspace_id == workspace_id,
            Notification.user_id == user_id,
        )
    )
    if notification is None:
        return None
    if notification.read_at is None:
        notification.read_at = datetime.now(timezone.utc)
        await session.commit()
        await session.refresh(notification)
    return notification


async def mark_all_read(session: AsyncSession, workspace_id: uuid.UUID, user_id: uuid.UUID) -> int:
    result = await session.execute(
        update(Notification)
        .where(
            Notification.workspace_id == workspace_id,
            Notification.user_id == user_id,
            Notification.read_at.is_(None),
        )
        .values(read_at=datetime.now(timezone.utc))
    )
    await session.commit()
    return int(getattr(result, "rowcount", 0) or 0)


# ---------------------------------------------------------------------------
# Producers fed by other services
# ---------------------------------------------------------------------------


async def notify_subscription_events(
    session: AsyncSession,
    workspace_id: uuid.UUID,
    user_id: uuid.UUID,
    events,
    deliver: bool = False,
) -> int:
    """Turn `subscription_service.ScanEvent`s into alerts. Flushes only."""
    created = 0
    for event in events:
        sub = event.subscription
        base_payload = {
            "name": sub.display_name,
            "amount": format_amount(sub.amount, sub.currency),
            "cadence": sub.cadence,
            "subscription_id": str(sub.id),
        }
        if event.kind == "new_subscription":
            kind, key, payload = kinds.NEW_SUBSCRIPTION, f"new_subscription:{sub.id}", base_payload
        elif event.kind == "price_changed":
            old_amount = Decimal(event.detail.get("old_amount", "0"))
            new_amount = Decimal(event.detail.get("new_amount", "0"))
            if new_amount <= old_amount:
                continue  # a price drop is good news, not an alert
            kind = kinds.PRICE_INCREASE
            key = f"price_increase:{sub.id}:{new_amount}"
            payload = {
                **base_payload,
                "old_amount": format_amount(old_amount, sub.currency),
                "new_amount": format_amount(new_amount, sub.currency),
            }
        elif event.kind == "charge_after_cancel":
            kind = kinds.CHARGE_AFTER_CANCEL
            key = f"charge_after_cancel:{sub.id}:{event.detail.get('date')}"
            payload = {
                **base_payload,
                "amount": format_amount(event.detail.get("amount", sub.amount), sub.currency),
                "date": event.detail.get("date", ""),
            }
        else:
            continue
        if await notify(
            session, workspace_id=workspace_id, user_id=user_id, kind=kind, payload=payload,
            dedupe_key=key, entity_type="subscription", entity_id=sub.id, deliver=deliver,
        ):
            created += 1
    return created


async def notify_sync_failed(
    session: AsyncSession, *, workspace_id: uuid.UUID, user_id: uuid.UUID,
    connection_id: uuid.UUID, name: str,
) -> None:
    today = datetime.now(timezone.utc).date().isoformat()
    await notify(
        session, workspace_id=workspace_id, user_id=user_id, kind=kinds.SYNC_FAILED,
        payload={"name": name, "connection_id": str(connection_id)},
        dedupe_key=f"sync_failed:{connection_id}:{today}",
        entity_type="connection", entity_id=connection_id,
    )
