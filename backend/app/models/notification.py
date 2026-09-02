import uuid
from datetime import datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, Index, Integer, Numeric, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.core.database import Base


class Notification(Base):
    """An alert raised for one user in one workspace (fork feature).

    `dedupe_key` is what stops the hourly sweep from raising the same alert
    twice: producers build it from the kind plus the entity and period
    (`budget_exceeded:{category}:{YYYY-MM}`), and the unique constraint makes
    a repeat insert a no-op. `delivered_channels` records where it went.
    """

    __tablename__ = "notifications"
    __table_args__ = (
        UniqueConstraint("workspace_id", "user_id", "dedupe_key", name="uq_notifications_dedupe"),
        Index("ix_notifications_inbox", "user_id", "workspace_id", "read_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"))
    workspace_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workspaces.id", ondelete="CASCADE"), index=True
    )
    kind: Mapped[str] = mapped_column(String(40))
    title: Mapped[str] = mapped_column(String(200))
    body: Mapped[str] = mapped_column(String(1000))
    payload: Mapped[dict] = mapped_column(JSON, default=dict)
    entity_type: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    entity_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    dedupe_key: Mapped[str] = mapped_column(String(200))
    delivered_channels: Mapped[list] = mapped_column(JSON, default=list)
    delivery_attempts: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    read_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)


class NotificationPreference(Base):
    """Per user, per workspace alert settings (fork feature)."""

    __tablename__ = "notification_preferences"
    __table_args__ = (
        UniqueConstraint("user_id", "workspace_id", name="uq_notification_preferences_user_workspace"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"))
    workspace_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workspaces.id", ondelete="CASCADE"), index=True
    )
    # {kind: bool}; a kind missing from the map is enabled.
    kinds: Mapped[dict] = mapped_column(JSON, default=dict)
    large_transaction_amount: Mapped[Decimal] = mapped_column(
        Numeric(precision=15, scale=2), default=Decimal("500"), server_default="500"
    )
    low_balance_amount: Mapped[Decimal] = mapped_column(
        Numeric(precision=15, scale=2), default=Decimal("100"), server_default="100"
    )
    reminder_days_before: Mapped[int] = mapped_column(Integer, default=3, server_default="3")
    unusual_spend_pct: Mapped[int] = mapped_column(Integer, default=50, server_default="50")
    daily_digest_hour: Mapped[int] = mapped_column(Integer, default=8, server_default="8")
    in_app_enabled: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    ntfy_enabled: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    ntfy_server_url: Mapped[str] = mapped_column(
        String(255), default="https://ntfy.sh", server_default="https://ntfy.sh"
    )
    ntfy_topic: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    ntfy_token_encrypted: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    def kind_enabled(self, kind: str) -> bool:
        return bool((self.kinds or {}).get(kind, True))
