"use client";

import { useActionState, useState } from "react";
import { updateProfile } from "@/server/actions/settings";
import { ActionNotice, Button, Field, Input } from "@/components/ui";

export function ProfileForm({ name, email }: { name: string; email: string }) {
  const [state, action, pending] = useActionState(updateProfile, undefined);
  const [value, setValue] = useState(name);
  return (
    <form action={action} className="space-y-4">
      <ActionNotice state={state} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name">
          <Input name="name" value={value} onChange={(e) => setValue(e.target.value)} maxLength={80} required autoComplete="name" />
        </Field>
        <Field label="Email" hint="Email changes are not supported yet.">
          <Input value={email} readOnly disabled className="opacity-70" />
        </Field>
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save profile"}
      </Button>
    </form>
  );
}
