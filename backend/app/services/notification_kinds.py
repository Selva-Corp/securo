"""Alert kinds (fork feature). The frontend mirrors this list for preferences."""

UPCOMING_BILL = "upcoming_bill"
NEW_SUBSCRIPTION = "new_subscription_detected"
PRICE_INCREASE = "price_increase"
CHARGE_AFTER_CANCEL = "charge_after_cancel"
LOW_BALANCE = "low_balance"
LARGE_TRANSACTION = "large_transaction"
UNUSUAL_SPEND = "unusual_spend"
BUDGET_EXCEEDED = "budget_exceeded"
SYNC_FAILED = "sync_failed"
TEST = "test"

ALL_KINDS: tuple[str, ...] = (
    UPCOMING_BILL,
    NEW_SUBSCRIPTION,
    PRICE_INCREASE,
    CHARGE_AFTER_CANCEL,
    LOW_BALANCE,
    LARGE_TRANSACTION,
    UNUSUAL_SPEND,
    BUDGET_EXCEEDED,
    SYNC_FAILED,
)

# ntfy tags double as emoji in the phone notification.
NTFY_TAGS: dict[str, list[str]] = {
    UPCOMING_BILL: ["calendar"],
    NEW_SUBSCRIPTION: ["mag"],
    PRICE_INCREASE: ["chart_with_upwards_trend"],
    CHARGE_AFTER_CANCEL: ["rotating_light"],
    LOW_BALANCE: ["warning"],
    LARGE_TRANSACTION: ["moneybag"],
    UNUSUAL_SPEND: ["bar_chart"],
    BUDGET_EXCEEDED: ["no_entry"],
    SYNC_FAILED: ["link"],
    TEST: ["white_check_mark"],
}

# ntfy priority 1-5; 4 is "high" (pops up), 3 default.
NTFY_PRIORITY: dict[str, int] = {
    CHARGE_AFTER_CANCEL: 4,
    LOW_BALANCE: 4,
    LARGE_TRANSACTION: 4,
    SYNC_FAILED: 3,
}

# Where a tap on the notification lands inside the app.
CLICK_PATH: dict[str, str] = {
    UPCOMING_BILL: "/recurring",
    NEW_SUBSCRIPTION: "/subscriptions",
    PRICE_INCREASE: "/subscriptions",
    CHARGE_AFTER_CANCEL: "/subscriptions",
    LOW_BALANCE: "/accounts",
    LARGE_TRANSACTION: "/transactions",
    UNUSUAL_SPEND: "/reports",
    BUDGET_EXCEEDED: "/budgets",
    SYNC_FAILED: "/accounts",
    TEST: "/notifications",
}
