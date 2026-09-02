"""Subscriptions hub API (fork feature)."""

import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_async_session
from app.core.workspace_context import (
    WorkspaceContext,
    current_workspace,
    current_writable_workspace,
)
from app.models.subscription import Subscription
from app.schemas.subscription import (
    ScanEventRead,
    ScanResponse,
    SubscriptionCancel,
    SubscriptionCharge,
    SubscriptionDetail,
    SubscriptionRead,
    SubscriptionSummary,
    SubscriptionUpdate,
    UpcomingSubscription,
)
from app.services import subscription_service

router = APIRouter(prefix="/api/subscriptions", tags=["subscriptions"])


def _to_read(sub: Subscription, logos: dict[uuid.UUID, Optional[str]]) -> SubscriptionRead:
    read = SubscriptionRead.model_validate(sub)
    return read.model_copy(
        update={
            "is_lapsed": subscription_service.is_lapsed(sub),
            "monthly_equivalent": subscription_service.monthly_equivalent(sub.amount, sub.cadence),
            "logo_url": logos.get(sub.payee_id) if sub.payee_id else None,
        }
    )


async def _load_or_404(
    session: AsyncSession, workspace_id: uuid.UUID, subscription_id: uuid.UUID
) -> Subscription:
    sub = await subscription_service.get_subscription(session, workspace_id, subscription_id)
    if sub is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Subscription not found")
    return sub


@router.get("", response_model=list[SubscriptionRead])
async def list_subscriptions(
    status_filter: Optional[str] = Query(default=None, alias="status"),
    ctx: WorkspaceContext = Depends(current_workspace),
    session: AsyncSession = Depends(get_async_session),
):
    rows = await subscription_service.list_subscriptions(session, ctx.workspace.id, status_filter)
    logos = await subscription_service.payee_logo_urls(session, ctx.workspace.id)
    return [_to_read(sub, logos) for sub in rows]


@router.get("/summary", response_model=SubscriptionSummary)
async def get_summary(
    ctx: WorkspaceContext = Depends(current_workspace),
    session: AsyncSession = Depends(get_async_session),
):
    summary = await subscription_service.get_summary(session, ctx.workspace.id)
    logos = await subscription_service.payee_logo_urls(session, ctx.workspace.id)
    summary["upcoming"] = [
        UpcomingSubscription(
            id=sub.id,
            display_name=sub.display_name,
            amount=sub.amount,
            currency=sub.currency,
            next_expected=sub.next_expected,
            cadence=sub.cadence,
            status=sub.status,
            logo_url=logos.get(sub.payee_id) if sub.payee_id else None,
        )
        for sub in summary["upcoming"]
    ]
    return summary


@router.post("/scan", response_model=ScanResponse)
async def scan(
    ctx: WorkspaceContext = Depends(current_writable_workspace),
    session: AsyncSession = Depends(get_async_session),
):
    result = await subscription_service.scan_workspace(session, ctx.workspace.id, ctx.user_id)
    return ScanResponse(
        created=result.created,
        updated=result.updated,
        removed=result.removed,
        events=[
            ScanEventRead(
                kind=event.kind,
                subscription_id=event.subscription.id,
                display_name=event.subscription.display_name,
                detail=event.detail,
            )
            for event in result.events
        ],
    )


@router.get("/{subscription_id}", response_model=SubscriptionDetail)
async def get_subscription(
    subscription_id: uuid.UUID,
    ctx: WorkspaceContext = Depends(current_workspace),
    session: AsyncSession = Depends(get_async_session),
):
    sub = await _load_or_404(session, ctx.workspace.id, subscription_id)
    logos = await subscription_service.payee_logo_urls(session, ctx.workspace.id)
    charges = await subscription_service.get_charges(session, sub)
    base = _to_read(sub, logos)
    return SubscriptionDetail(
        **base.model_dump(),
        charges=[SubscriptionCharge.model_validate(tx) for tx in charges],
    )


@router.patch("/{subscription_id}", response_model=SubscriptionRead)
async def update_subscription(
    subscription_id: uuid.UUID,
    data: SubscriptionUpdate,
    ctx: WorkspaceContext = Depends(current_writable_workspace),
    session: AsyncSession = Depends(get_async_session),
):
    sub = await _load_or_404(session, ctx.workspace.id, subscription_id)
    sub = await subscription_service.update_subscription(session, sub, data)
    logos = await subscription_service.payee_logo_urls(session, ctx.workspace.id)
    return _to_read(sub, logos)


@router.post("/{subscription_id}/track", response_model=SubscriptionRead)
async def track_subscription(
    subscription_id: uuid.UUID,
    ctx: WorkspaceContext = Depends(current_writable_workspace),
    session: AsyncSession = Depends(get_async_session),
):
    sub = await _load_or_404(session, ctx.workspace.id, subscription_id)
    try:
        sub = await subscription_service.track(session, sub, ctx.workspace.id, ctx.user_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    logos = await subscription_service.payee_logo_urls(session, ctx.workspace.id)
    return _to_read(sub, logos)


@router.post("/{subscription_id}/ignore", response_model=SubscriptionRead)
async def ignore_subscription(
    subscription_id: uuid.UUID,
    ctx: WorkspaceContext = Depends(current_writable_workspace),
    session: AsyncSession = Depends(get_async_session),
):
    sub = await _load_or_404(session, ctx.workspace.id, subscription_id)
    sub = await subscription_service.ignore(session, sub)
    logos = await subscription_service.payee_logo_urls(session, ctx.workspace.id)
    return _to_read(sub, logos)


@router.post("/{subscription_id}/cancel", response_model=SubscriptionRead)
async def cancel_subscription(
    subscription_id: uuid.UUID,
    data: Optional[SubscriptionCancel] = None,
    ctx: WorkspaceContext = Depends(current_writable_workspace),
    session: AsyncSession = Depends(get_async_session),
):
    sub = await _load_or_404(session, ctx.workspace.id, subscription_id)
    sub = await subscription_service.cancel(session, sub, data.cancelled_at if data else None)
    logos = await subscription_service.payee_logo_urls(session, ctx.workspace.id)
    return _to_read(sub, logos)


@router.post("/{subscription_id}/restore", response_model=SubscriptionRead)
async def restore_subscription(
    subscription_id: uuid.UUID,
    ctx: WorkspaceContext = Depends(current_writable_workspace),
    session: AsyncSession = Depends(get_async_session),
):
    sub = await _load_or_404(session, ctx.workspace.id, subscription_id)
    sub = await subscription_service.restore(session, sub)
    logos = await subscription_service.payee_logo_urls(session, ctx.workspace.id)
    return _to_read(sub, logos)
