"""Alert sweep and ntfy delivery (fork feature).

`run_alert_sweep` runs hourly: large-transaction alerts every run, the daily
producers when the user's local hour matches their digest hour.
`deliver_pending_notifications` runs every minute and pushes whatever has
not reached ntfy yet, so request-path producers never block on HTTP.
"""

import asyncio
import logging
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.core.config import get_settings
from app.models.workspace import WorkspaceMember
from app.services import alert_sweep_service, notification_service
from app.worker import celery_app

logger = logging.getLogger(__name__)


def _make_session_maker():
    settings = get_settings()
    engine = create_async_engine(settings.database_url, poolclass=NullPool)
    return engine, async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def _sweep_all() -> dict:
    engine, session_maker = _make_session_maker()
    created = 0
    try:
        async with session_maker() as session:
            result = await session.execute(
                select(WorkspaceMember.workspace_id, WorkspaceMember.user_id)
            )
            targets: list[tuple[uuid.UUID, uuid.UUID]] = [
                (row.workspace_id, row.user_id) for row in result.all()
            ]
        for workspace_id, user_id in targets:
            try:
                async with session_maker() as session:
                    created += await alert_sweep_service.sweep_workspace(session, workspace_id, user_id)
            except Exception:
                logger.exception("Alert sweep failed for workspace %s user %s", workspace_id, user_id)
        async with session_maker() as session:
            sent = await notification_service.deliver_pending(session)
    finally:
        await engine.dispose()
    return {"created": created, "sent": sent}


@celery_app.task(name="app.tasks.notification_tasks.run_alert_sweep")
def run_alert_sweep() -> dict:
    summary = asyncio.run(_sweep_all())
    logger.info("Alert sweep complete: %s", summary)
    return summary


async def _deliver() -> int:
    engine, session_maker = _make_session_maker()
    try:
        async with session_maker() as session:
            return await notification_service.deliver_pending(session)
    finally:
        await engine.dispose()


@celery_app.task(name="app.tasks.notification_tasks.deliver_pending_notifications")
def deliver_pending_notifications() -> dict:
    sent = asyncio.run(_deliver())
    if sent:
        logger.info("Delivered %d notifications via ntfy", sent)
    return {"sent": sent}
