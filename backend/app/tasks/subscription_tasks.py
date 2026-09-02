"""Nightly subscription scan across every workspace (fork feature).

Sync and import already rescan the workspace they touched inline; this task
catches manual edits (category changes, payee assignments) and keeps
`next_expected`/lapsed state fresh for workspaces with no bank connection.
"""

import asyncio
import logging
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.core.config import get_settings
from app.models.workspace import WorkspaceMember
from app.services import subscription_service
from app.worker import celery_app

logger = logging.getLogger(__name__)


def _make_session_maker():
    settings = get_settings()
    engine = create_async_engine(settings.database_url, poolclass=NullPool)
    return engine, async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def _scan_all() -> dict:
    engine, session_maker = _make_session_maker()
    created = updated = removed = 0
    try:
        async with session_maker() as session:
            result = await session.execute(
                select(WorkspaceMember.workspace_id, WorkspaceMember.user_id).where(
                    WorkspaceMember.role == "owner"
                )
            )
            targets: list[tuple[uuid.UUID, uuid.UUID]] = [
                (row.workspace_id, row.user_id) for row in result.all()
            ]

        for workspace_id, user_id in targets:
            try:
                async with session_maker() as session:
                    scan = await subscription_service.scan_workspace(session, workspace_id, user_id)
                    created += scan.created
                    updated += scan.updated
                    removed += scan.removed
            except Exception:
                logger.exception("Subscription scan failed for workspace %s", workspace_id)
    finally:
        await engine.dispose()
    return {"created": created, "updated": updated, "removed": removed}


@celery_app.task(name="app.tasks.subscription_tasks.scan_all_subscriptions")
def scan_all_subscriptions() -> dict:
    summary = asyncio.run(_scan_all())
    logger.info("Subscription scan complete: %s", summary)
    return summary
