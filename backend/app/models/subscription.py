import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import TYPE_CHECKING, Optional

from sqlalchemy import (
    JSON,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.account import Account
    from app.models.category import Category
    from app.models.payee import Payee
    from app.models.recurring_transaction import RecurringTransaction

SUBSCRIPTION_STATUSES = ("suggested", "tracked", "ignored", "cancelled")
SUBSCRIPTION_CADENCES = ("weekly", "biweekly", "monthly", "quarterly", "yearly")


class Subscription(Base):
    """A recurring charge found in transaction history (fork feature).

    One row per merchant + currency per workspace. `status` is the user's
    decision about it; every other column is refreshed by each scan. Rows are
    keyed by `merchant_key` so a rescan updates the same row rather than
    proposing the same subscription again after the user dismissed it.
    """

    __tablename__ = "subscriptions"
    __table_args__ = (
        UniqueConstraint("workspace_id", "merchant_key", "currency", name="uq_subscriptions_merchant"),
        CheckConstraint(
            "status IN ('suggested', 'tracked', 'ignored', 'cancelled')",
            name="ck_subscriptions_status",
        ),
        CheckConstraint(
            "cadence IN ('weekly', 'biweekly', 'monthly', 'quarterly', 'yearly')",
            name="ck_subscriptions_cadence",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))
    workspace_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workspaces.id", ondelete="CASCADE"), index=True
    )
    merchant_key: Mapped[str] = mapped_column(String(200))
    display_name: Mapped[str] = mapped_column(String(200))
    payee_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("payees.id", ondelete="SET NULL"), nullable=True
    )
    account_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("accounts.id", ondelete="SET NULL"), nullable=True
    )
    category_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("categories.id", ondelete="SET NULL"), nullable=True
    )
    currency: Mapped[str] = mapped_column(String(3), default="USD")
    cadence: Mapped[str] = mapped_column(String(20))
    amount: Mapped[Decimal] = mapped_column(Numeric(precision=15, scale=2))
    average_amount: Mapped[Decimal] = mapped_column(Numeric(precision=15, scale=2))
    first_seen: Mapped[date] = mapped_column(Date)
    last_seen: Mapped[date] = mapped_column(Date)
    next_expected: Mapped[date] = mapped_column(Date)
    occurrence_count: Mapped[int] = mapped_column(Integer, default=0)
    confidence: Mapped[Decimal] = mapped_column(Numeric(precision=3, scale=2), default=Decimal("0"))
    status: Mapped[str] = mapped_column(String(20), default="suggested", server_default="suggested")
    cancelled_at: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    recurring_transaction_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("recurring_transactions.id", ondelete="SET NULL"),
        nullable=True,
    )
    price_history: Mapped[list] = mapped_column(JSON, default=list)
    transaction_ids: Mapped[list] = mapped_column(JSON, default=list)
    last_scanned_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    payee: Mapped[Optional["Payee"]] = relationship()
    account: Mapped[Optional["Account"]] = relationship()
    category: Mapped[Optional["Category"]] = relationship()
    recurring_transaction: Mapped[Optional["RecurringTransaction"]] = relationship()
