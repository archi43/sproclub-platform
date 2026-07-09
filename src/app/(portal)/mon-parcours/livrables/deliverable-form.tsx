"use client";

import { useFormState, useFormStatus } from "react-dom";
import { submitDeliverableAction, type SubmitState } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form";
import { Alert } from "@/components/ui/alert";

const initial: SubmitState = { ok: false, message: "" };

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Dépôt…" : "Déposer"}
    </Button>
  );
}

/** Deposit form for a single, not-yet-submitted deliverable. */
export function DeliverableForm({ deliverableId }: { deliverableId: string }) {
  const [state, action] = useFormState(submitDeliverableAction, initial);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="deliverableId" value={deliverableId} />
      <div className="flex flex-wrap items-center gap-2">
        <Input
          name="url"
          type="url"
          required
          aria-label="Lien vers votre livrable"
          placeholder="https://lien-vers-votre-livrable"
          className="min-w-64 flex-1"
        />
        <Submit />
      </div>
      {state.message && <Alert tone={state.ok ? "success" : "error"}>{state.message}</Alert>}
    </form>
  );
}
