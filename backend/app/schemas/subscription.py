import uuid
from datetime import date as _Date
from datetime import datetime
from decimal import Decimal
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict

SubscriptionStatus = Literal["suggested", "tracked", "ignored", "cancelled"]
SubscriptionCadence = Literal["weekly", "biweekly", "monthly", "quarterly", "yearly"]


class SubscriptionRead(BaseModel):
    id: uuid.UUID
    display_name: str
    merchant_key: str
    payee_id: Optional[uuid.UUID] = None
    account_id: Optional[uuid.UUID] = None
    category_id: Optional[uuid.UUID] = None
    currency: str
    cadence: str
    amount: Decimal
    average_amount: Decimal
    first_seen: _Date
    last_seen: _Date
    next_expected: _Date
    occurrence_count: int
    confidence: Decimal
    status: str
    cancelled_at: Optional[_Date] = None
    recurring_transaction_id: Optional[uuid.UUID] = None
    price_history: list[dict] = []
    is_lapsed: bool = False
    monthly_equivalent: Decimal = Decimal("0")
    logo_url: Optional[str] = None
    last_scanned_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class SubscriptionCharge(BaseModel):
    id: uuid.UUID
    date: _Date
    amount: Decimal
    currency: str
    description: str

    model_config = ConfigDict(from_attributes=True)


class SubscriptionDetail(SubscriptionRead):
    charges: list[SubscriptionCharge] = []


class SubscriptionUpdate(BaseModel):
    display_name: Optional[str] = None
    cadence: Optional[SubscriptionCadence] = None
    amount: Optional[Decimal] = None
    payee_id: Optional[uuid.UUID] = None
    category_id: Optional[uuid.UUID] = None
    account_id: Optional[uuid.UUID] = None


class SubscriptionCancel(BaseModel):
    cancelled_at: Optional[_Date] = None


class CurrencyTotal(BaseModel):
    currency: str
    monthly: Decimal
    annual: Decimal


class UpcomingSubscription(BaseModel):
    id: uuid.UUID
    display_name: str
    amount: Decimal
    currency: str
    next_expected: _Date
    cadence: str
    status: str
    logo_url: Optional[str] = None


class SubscriptionSummary(BaseModel):
    totals: list[CurrencyTotal]
    tracked_count: int
    suggested_count: int
    cancelled_count: int
    ignored_count: int
    upcoming: list[UpcomingSubscription]
    last_scanned_at: Optional[datetime] = None


class ScanEventRead(BaseModel):
    kind: str
    subscription_id: uuid.UUID
    display_name: str
    detail: dict = {}


class ScanResponse(BaseModel):
    created: int
    updated: int
    removed: int
    events: list[ScanEventRead]
