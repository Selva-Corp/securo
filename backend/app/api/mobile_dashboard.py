"""Phone home-screen summary (fork feature)."""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_async_session
from app.core.workspace_context import WorkspaceContext, current_workspace
from app.schemas.mobile_dashboard import MobileSummaryRead
from app.services import mobile_dashboard_service

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.get("/mobile-summary", response_model=MobileSummaryRead)
async def get_mobile_summary(
    ctx: WorkspaceContext = Depends(current_workspace),
    session: AsyncSession = Depends(get_async_session),
):
    return await mobile_dashboard_service.get_mobile_summary(session, ctx.workspace.id, ctx.user_id)
