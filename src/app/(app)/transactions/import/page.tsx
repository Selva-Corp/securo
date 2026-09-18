import { requireUser } from "@/server/session";
import { getAccountsWithBalances } from "@/server/queries";
import { EmptyState, LinkButton, PageHeader } from "@/components/ui";
import { ImportWizard } from "./import-wizard";

export default async function ImportPage() {
  const user = await requireUser();
  const accounts = await getAccountsWithBalances(user.id);

  return (
    <>
      <PageHeader
        title="Import CSV"
        description="Upload a statement export from your bank. Duplicates are skipped and new rows go to Review."
        actions={
          <LinkButton href="/transactions" variant="secondary">
            Back to transactions
          </LinkButton>
        }
      />
      {accounts.length === 0 ? (
        <EmptyState
          title="Add an account first"
          description="Imported transactions need an account to live in."
          action={<LinkButton href="/accounts">Go to accounts</LinkButton>}
        />
      ) : (
        <ImportWizard accounts={accounts.map((a) => ({ id: a.id, name: a.name }))} currency={user.currency} />
      )}
    </>
  );
}
