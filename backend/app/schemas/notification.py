import uuid
from datetime import datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class NotificationRead(BaseModel):
    id: uuid.UUID
    kind: str
    title: str
    body: str
    payload: dict = {}
    entity_type: Optional[str] = None
    entity_id: Optional[uuid.UUID] = None
    delivered_channels: list[str] = []
    created_at: datetime
    read_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class UnreadCount(BaseModel):
    count: int


class NotificationPreferencesRead(BaseModel):
    kinds: dict[str, bool] = {}
    large_transaction_amount: Decimal
    low_balance_amount: Decimal
    reminder_days_before: int
    unusual_spend_pct: int
    daily_digest_hour: int
    in_app_enabled: bool
    ntfy_enabled: bool
    ntfy_server_url: str
    ntfy_topic: Optional[str] = None
    has_ntfy_token: bool = False

    model_config = ConfigDict(from_attributes=True)


class NotificationPreferencesUpdate(BaseModel):
    kinds: Optional[dict[str, bool]] = None
    large_transaction_amount: Optional[Decimal] = Field(default=None, ge=0)
    low_balance_amount: Optional[Decimal] = Field(default=None, ge=0)
    reminder_days_before: Optional[int] = Field(default=None, ge=0, le=30)
    unusual_spend_pct: Optional[int] = Field(default=None, ge=0, le=1000)
    daily_digest_hour: Optional[int] = Field(default=None, ge=0, le=23)
    in_app_enabled: Optional[bool] = None
    ntfy_enabled: Optional[bool] = None
    ntfy_server_url: Optional[str] = Field(default=None, max_length=255)
    ntfy_topic: Optional[str] = Field(default=None, max_length=128)
    # Write-only: the stored token is never returned.
    ntfy_token: Optional[str] = Field(default=None, max_length=256)
    clear_ntfy_token: bool = False


class TestResult(BaseModel):
    ok: bool
    error: Optional[str] = None
