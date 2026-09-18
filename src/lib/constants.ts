export const BUCKETS = ["NEEDS", "WANTS", "SAVINGS_DEBT", "INCOME"] as const;
export type Bucket = (typeof BUCKETS)[number];
export type SpendingBucket = Exclude<Bucket, "INCOME">;
export const SPENDING_BUCKETS: SpendingBucket[] = ["NEEDS", "WANTS", "SAVINGS_DEBT"];

export const BUCKET_LABEL: Record<Bucket, string> = {
  NEEDS: "Needs",
  WANTS: "Wants",
  SAVINGS_DEBT: "Savings & Debt",
  INCOME: "Income",
};

export const BUCKET_DESCRIPTION: Record<SpendingBucket, string> = {
  NEEDS: "Housing, groceries, utilities, insurance, transport to work.",
  WANTS: "Dining out, entertainment, shopping, subscriptions, travel.",
  SAVINGS_DEBT: "Emergency fund, goals, investing, extra debt payments.",
};

// Tailwind color families used consistently for each bucket.
export const BUCKET_COLOR: Record<Bucket, string> = {
  NEEDS: "sky",
  WANTS: "violet",
  SAVINGS_DEBT: "emerald",
  INCOME: "amber",
};

export const ACCOUNT_TYPES = [
  "CHECKING",
  "SAVINGS",
  "CREDIT",
  "CASH",
  "INVESTMENT",
  "LOAN",
] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export const ACCOUNT_TYPE_LABEL: Record<AccountType, string> = {
  CHECKING: "Checking",
  SAVINGS: "Savings",
  CREDIT: "Credit card",
  CASH: "Cash",
  INVESTMENT: "Investment",
  LOAN: "Loan",
};

// Liability accounts hold a negative balance when money is owed.
export const LIABILITY_TYPES: AccountType[] = ["CREDIT", "LOAN"];

export const PAY_FREQUENCIES = ["WEEKLY", "BIWEEKLY", "SEMIMONTHLY", "MONTHLY"] as const;
export type PayFrequency = (typeof PAY_FREQUENCIES)[number];

export const PAY_FREQUENCY_LABEL: Record<PayFrequency, string> = {
  WEEKLY: "Weekly",
  BIWEEKLY: "Every two weeks",
  SEMIMONTHLY: "Twice a month",
  MONTHLY: "Monthly",
};

// Paychecks per month, used to turn a paycheck into a monthly figure.
export const PAYCHECKS_PER_MONTH: Record<PayFrequency, number> = {
  WEEKLY: 52 / 12,
  BIWEEKLY: 26 / 12,
  SEMIMONTHLY: 2,
  MONTHLY: 1,
};

export const GOAL_KINDS = ["SAVINGS", "DEBT"] as const;
export type GoalKind = (typeof GOAL_KINDS)[number];

export const DEFAULT_CATEGORIES: { name: string; bucket: Bucket; icon: string }[] = [
  { name: "Rent / Mortgage", bucket: "NEEDS", icon: "home" },
  { name: "Groceries", bucket: "NEEDS", icon: "shopping-cart" },
  { name: "Utilities", bucket: "NEEDS", icon: "zap" },
  { name: "Transportation", bucket: "NEEDS", icon: "car" },
  { name: "Insurance", bucket: "NEEDS", icon: "shield" },
  { name: "Health", bucket: "NEEDS", icon: "heart-pulse" },
  { name: "Phone & Internet", bucket: "NEEDS", icon: "wifi" },
  { name: "Dining Out", bucket: "WANTS", icon: "utensils" },
  { name: "Entertainment", bucket: "WANTS", icon: "clapperboard" },
  { name: "Shopping", bucket: "WANTS", icon: "shopping-bag" },
  { name: "Subscriptions", bucket: "WANTS", icon: "repeat" },
  { name: "Travel", bucket: "WANTS", icon: "plane" },
  { name: "Personal Care", bucket: "WANTS", icon: "sparkles" },
  { name: "Emergency Fund", bucket: "SAVINGS_DEBT", icon: "life-buoy" },
  { name: "Investing", bucket: "SAVINGS_DEBT", icon: "trending-up" },
  { name: "Debt Payments", bucket: "SAVINGS_DEBT", icon: "credit-card" },
  { name: "Goal Contributions", bucket: "SAVINGS_DEBT", icon: "target" },
  { name: "Paycheck", bucket: "INCOME", icon: "banknote" },
  { name: "Other Income", bucket: "INCOME", icon: "coins" },
];
