"""alerts and notifications with ntfy delivery (fork feature)

Revision ID: selva002
Revises: selva001
Create Date: 2026-09-02
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "selva002"
down_revision: Union[str, None] = "selva001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "notifications",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id", postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False,
        ),
        sa.Column(
            "workspace_id", postgresql.UUID(as_uuid=True),
            sa.ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False,
        ),
        sa.Column("kind", sa.String(40), nullable=False),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("body", sa.String(1000), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=False, server_default="{}"),
        sa.Column("entity_type", sa.String(40), nullable=True),
        sa.Column("entity_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("dedupe_key", sa.String(200), nullable=False),
        sa.Column("delivered_channels", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("delivery_attempts", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("read_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("workspace_id", "user_id", "dedupe_key", name="uq_notifications_dedupe"),
    )
    op.create_index("ix_notifications_workspace_id", "notifications", ["workspace_id"])
    op.create_index("ix_notifications_inbox", "notifications", ["user_id", "workspace_id", "read_at"])

    op.create_table(
        "notification_preferences",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id", postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False,
        ),
        sa.Column(
            "workspace_id", postgresql.UUID(as_uuid=True),
            sa.ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False,
        ),
        sa.Column("kinds", sa.JSON(), nullable=False, server_default="{}"),
        sa.Column("large_transaction_amount", sa.Numeric(15, 2), nullable=False, server_default="500"),
        sa.Column("low_balance_amount", sa.Numeric(15, 2), nullable=False, server_default="100"),
        sa.Column("reminder_days_before", sa.Integer(), nullable=False, server_default="3"),
        sa.Column("unusual_spend_pct", sa.Integer(), nullable=False, server_default="50"),
        sa.Column("daily_digest_hour", sa.Integer(), nullable=False, server_default="8"),
        sa.Column("in_app_enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("ntfy_enabled", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("ntfy_server_url", sa.String(255), nullable=False, server_default="https://ntfy.sh"),
        sa.Column("ntfy_topic", sa.String(128), nullable=True),
        sa.Column("ntfy_token_encrypted", sa.String(512), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("user_id", "workspace_id", name="uq_notification_preferences_user_workspace"),
    )
    op.create_index(
        "ix_notification_preferences_workspace_id", "notification_preferences", ["workspace_id"]
    )


def downgrade() -> None:
    op.drop_index("ix_notification_preferences_workspace_id", table_name="notification_preferences")
    op.drop_table("notification_preferences")
    op.drop_index("ix_notifications_inbox", table_name="notifications")
    op.drop_index("ix_notifications_workspace_id", table_name="notifications")
    op.drop_table("notifications")
