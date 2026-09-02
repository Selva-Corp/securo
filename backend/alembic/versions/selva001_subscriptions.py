"""subscriptions hub: detected recurring charges (fork feature)

Revision ID: selva001
Revises: 076
Create Date: 2026-09-02

Fork migrations use non-numeric revision ids so they never collide with an
upstream revision by name. See FORK.md for the re-parenting rule applied when
upstream adds its own 077 (see the checker: filename prefix must equal the revision id).
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "selva001"
down_revision: Union[str, None] = "076"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "subscriptions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column(
            "workspace_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("workspaces.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("merchant_key", sa.String(200), nullable=False),
        sa.Column("display_name", sa.String(200), nullable=False),
        sa.Column(
            "payee_id", postgresql.UUID(as_uuid=True),
            sa.ForeignKey("payees.id", ondelete="SET NULL"), nullable=True,
        ),
        sa.Column(
            "account_id", postgresql.UUID(as_uuid=True),
            sa.ForeignKey("accounts.id", ondelete="SET NULL"), nullable=True,
        ),
        sa.Column(
            "category_id", postgresql.UUID(as_uuid=True),
            sa.ForeignKey("categories.id", ondelete="SET NULL"), nullable=True,
        ),
        sa.Column("currency", sa.String(3), nullable=False, server_default="USD"),
        sa.Column("cadence", sa.String(20), nullable=False),
        sa.Column("amount", sa.Numeric(15, 2), nullable=False),
        sa.Column("average_amount", sa.Numeric(15, 2), nullable=False),
        sa.Column("first_seen", sa.Date(), nullable=False),
        sa.Column("last_seen", sa.Date(), nullable=False),
        sa.Column("next_expected", sa.Date(), nullable=False),
        sa.Column("occurrence_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("confidence", sa.Numeric(3, 2), nullable=False, server_default="0"),
        sa.Column("status", sa.String(20), nullable=False, server_default="suggested"),
        sa.Column("cancelled_at", sa.Date(), nullable=True),
        sa.Column(
            "recurring_transaction_id", postgresql.UUID(as_uuid=True),
            sa.ForeignKey("recurring_transactions.id", ondelete="SET NULL"), nullable=True,
        ),
        sa.Column("price_history", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("transaction_ids", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("last_scanned_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("workspace_id", "merchant_key", "currency", name="uq_subscriptions_merchant"),
        sa.CheckConstraint(
            "status IN ('suggested', 'tracked', 'ignored', 'cancelled')",
            name="ck_subscriptions_status",
        ),
        sa.CheckConstraint(
            "cadence IN ('weekly', 'biweekly', 'monthly', 'quarterly', 'yearly')",
            name="ck_subscriptions_cadence",
        ),
    )
    op.create_index("ix_subscriptions_workspace_id", "subscriptions", ["workspace_id"])
    op.create_index("ix_subscriptions_workspace_status", "subscriptions", ["workspace_id", "status"])


def downgrade() -> None:
    op.drop_index("ix_subscriptions_workspace_status", table_name="subscriptions")
    op.drop_index("ix_subscriptions_workspace_id", table_name="subscriptions")
    op.drop_table("subscriptions")
