import type { AccountType } from "@/lib/constants";

/** Plain, serializable view of an account for the client components on this page. */
export interface AccountView {
  id: string;
  name: string;
  type: AccountType;
  currency: string;
  institution: string | null;
  balance: number;
  /** True when the balance comes from a bank connection. */
  synced: boolean;
  /** "synced 2h ago" style label, computed on the server. Null for manual accounts. */
  syncedLabel: string | null;
  inSpendable: boolean;
  archived: boolean;
  txnCount: number;
}
