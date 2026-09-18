import { FormError } from "./input";

/** Common result shape for server actions driven by useActionState or useTransition. */
export type ActionState = { ok: true; message?: string } | { ok: false; error: string } | undefined;

export function FormSuccess({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <p
      role="status"
      className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200"
    >
      {message}
    </p>
  );
}

/** Renders the error or success message for an ActionState, or nothing. */
export function ActionNotice({ state }: { state: ActionState }) {
  if (!state) return null;
  if (!state.ok) return <FormError message={state.error} />;
  return <FormSuccess message={state.message} />;
}
