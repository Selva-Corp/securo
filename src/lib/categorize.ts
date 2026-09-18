/**
 * Keyword-based category suggestions for imported and synced transactions.
 * Suggestions only pre-fill the review queue; the user confirms with a swipe.
 */

const RULES: { pattern: RegExp; category: string }[] = [
  { pattern: /payroll|direct dep|salary|paycheck|\bpayrl\b|\bdd\b.*deposit/i, category: "Paycheck" },
  { pattern: /rent|mortgage|apartments|property mgmt|landlord/i, category: "Rent / Mortgage" },
  { pattern: /whole foods|trader joe|kroger|safeway|aldi|costco|walmart|publix|wegmans|h-e-b|heb\b|grocery|market basket|sprouts/i, category: "Groceries" },
  { pattern: /electric|power|gas co|water|utilit|energy|pg&e|con ?ed|duke energy/i, category: "Utilities" },
  { pattern: /verizon|at&t|t-mobile|comcast|xfinity|spectrum|internet|wireless|fiber/i, category: "Phone & Internet" },
  { pattern: /shell|chevron|exxon|bp\b|uber|lyft|transit|metro|parking|toll|gas station|arco|76\b/i, category: "Transportation" },
  { pattern: /geico|state farm|allstate|progressive|insurance/i, category: "Insurance" },
  { pattern: /pharmacy|cvs|walgreens|clinic|dental|medical|doctor|hospital|health/i, category: "Health" },
  { pattern: /netflix|spotify|hulu|disney\+|hbo|max\b|apple\.com\/bill|icloud|youtube premium|prime video|subscription|patreon|adobe/i, category: "Subscriptions" },
  { pattern: /restaurant|bistro|grill|cafe|coffee|starbucks|chipotle|mcdonald|taco|pizza|doordash|grubhub|ubereats|uber eats|sushi|burger|kitchen|diner|bar\b|brewery/i, category: "Dining Out" },
  { pattern: /amazon|target|best buy|ikea|etsy|ebay|nike|zara|h&m|mall|shop/i, category: "Shopping" },
  { pattern: /cinema|amc|theater|theatre|steam|playstation|xbox|nintendo|ticketmaster|concert|museum/i, category: "Entertainment" },
  { pattern: /airline|airways|delta|united|southwest|jetblue|hotel|airbnb|marriott|hilton|expedia|booking\.com/i, category: "Travel" },
  { pattern: /salon|barber|spa|gym|fitness|planet fitness|equinox|sephora|ulta/i, category: "Personal Care" },
  { pattern: /vanguard|fidelity|schwab|robinhood|betterment|wealthfront|brokerage|401k|ira\b/i, category: "Investing" },
  { pattern: /loan pmt|loan payment|student loan|navient|nelnet|sallie|auto loan|car payment|credit card payment|card pmt|autopay/i, category: "Debt Payments" },
  { pattern: /transfer to savings|savings transfer|emergency/i, category: "Emergency Fund" },
];

/** Returns the suggested category name for a payee/memo string, or null. */
export function suggestCategoryName(text: string): string | null {
  const hay = text.trim();
  if (!hay) return null;
  for (const rule of RULES) if (rule.pattern.test(hay)) return rule.category;
  return null;
}

/** Transfers between the user's own accounts should not count as spending. */
export function looksLikeTransfer(text: string): boolean {
  return /\b(transfer|xfer|zelle to self|internal tfr)\b/i.test(text) && !/transfer to savings/i.test(text);
}

/**
 * Resolve a suggestion to a category id given the user's categories.
 * Prefers an exact name match, then a case-insensitive one.
 */
export function suggestCategoryId(
  text: string,
  categories: { id: string; name: string; archived?: boolean }[],
): string | null {
  const name = suggestCategoryName(text);
  if (!name) return null;
  const live = categories.filter((c) => !c.archived);
  return live.find((c) => c.name === name)?.id ?? live.find((c) => c.name.toLowerCase() === name.toLowerCase())?.id ?? null;
}
