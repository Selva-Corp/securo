from datetime import date
from decimal import Decimal

from pydantic import BaseModel, ConfigDict


class UpcomingItemRead(BaseModel):
    id: str
    kind: str
    name: str
    date: date
    amount: Decimal
    currency: str
    amount_primary: Decimal

    model_config = ConfigDict(from_attributes=True)


class MobileSummaryRead(BaseModel):
    primary_currency: str
    as_of: date
    days_left_in_month: int
    cash_balance_primary: Decimal
    upcoming_bills_primary: Decimal
    budget_remaining_primary: Decimal
    safe_to_spend_primary: Decimal
    safe_per_day_primary: Decimal
    upcoming: list[UpcomingItemRead]

    model_config = ConfigDict(from_attributes=True)
