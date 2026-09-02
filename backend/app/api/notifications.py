"""Alerts inbox and preferences API (fork feature)."""

import uuid
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_async_session
from app.core.workspace_context import WorkspaceContext, current_workspace
from app.models.notification import NotificationPreference
from app.schemas.notification import (
    NotificationPreferencesRead,
    NotificationPreferencesUpdate,
    NotificationRead,
    TestResult,
    UnreadCount,
)
from app.services import notification_service

router = APIRouter(prefix="/api/notifications", tags=["notifications"])


def _prefs_read(prefs: NotificationPreference) -> NotificationPreferencesRead:
    read = NotificationPreferencesRead.model_validate(prefs)
    return read.model_copy(update={"has_ntfy_token": bool(prefs.ntfy_token_encrypted)})


@router.get("", response_model=list[NotificationRead])
async def list_notifications(
    unread_only: bool = Query(default=False),
    limit: int = Query(default=50, ge=1, le=200),
    before: Optional[datetime] = Query(default=None),
    ctx: WorkspaceContext = Depends(current_workspace),
    session: AsyncSession = Depends(get_async_session),
):
    return await notification_service.list_notifications(
        session, ctx.workspace.id, ctx.user_id, unread_only=unread_only, limit=limit, before=before
    )


@router.get("/unread-count", response_model=UnreadCount)
async def get_unread_count(
    ctx: WorkspaceContext = Depends(current_workspace),
    session: AsyncSession = Depends(get_async_session),
):
    return UnreadCount(count=await notification_service.unread_count(session, ctx.workspace.id, ctx.user_id))


@router.post("/read-all", response_model=UnreadCount)
async def mark_all_read(
    ctx: WorkspaceContext = Depends(current_workspace),
    session: AsyncSession = Depends(get_async_session),
):
    marked = await notification_service.mark_all_read(session, ctx.workspace.id, ctx.user_id)
    return UnreadCount(count=marked)


@router.post("/{notification_id}/read", response_model=NotificationRead)
async def mark_read(
    notification_id: uuid.UUID,
    ctx: WorkspaceContext = Depends(current_workspace),
    session: AsyncSession = Depends(get_async_session),
):
    notification = await notification_service.mark_read(
        session, ctx.workspace.id, ctx.user_id, notification_id
    )
    if notification is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notification not found")
    return notification


@router.get("/preferences", response_model=NotificationPreferencesRead)
async def get_preferences(
    ctx: WorkspaceContext = Depends(current_workspace),
    session: AsyncSession = Depends(get_async_session),
):
    prefs = await notification_service.get_preferences(session, ctx.workspace.id, ctx.user_id)
    assert prefs is not None  # create=True
    await session.commit()
    return _prefs_read(prefs)


@router.put("/preferences", response_model=NotificationPreferencesRead)
async def update_preferences(
    data: NotificationPreferencesUpdate,
    ctx: WorkspaceContext = Depends(current_workspace),
    session: AsyncSession = Depends(get_async_session),
):
    prefs = await notification_service.update_preferences(
        session, ctx.workspace.id, ctx.user_id, data.model_dump(exclude_unset=True)
    )
    return _prefs_read(prefs)


@router.post("/test", response_model=TestResult)
async def send_test(
    ctx: WorkspaceContext = Depends(current_workspace),
    session: AsyncSession = Depends(get_async_session),
):
    ok, error = await notification_service.send_test(session, ctx.workspace.id, ctx.user_id)
    await session.commit()
    return TestResult(ok=ok, error=error)
