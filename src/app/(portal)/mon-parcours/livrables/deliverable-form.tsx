"use client";

import { useFormState, useFormStatus } from "react-dom";
import { submitDeliverableAction, type SubmitState } from "./actions";

const initial: SubmitState = { ok: false, message: "" };

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} style={{ padding: "8px 14px" }}>
      {pending ? "Dépôt…" : "Déposer"}
    </button>
  );
}

/** Deposit form for a single, not-yet-submitted deliverable. */
export function DeliverableForm({ deliverableId }: { deliverableId: string }) {
  const [state, action] = useFormState(submitDeliverableAction, initial);
  return (
    <form action={action} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      <input type="hidden" name="deliverableId" value={deliverableId} />
      <input
        name="url"
        type="url"
        required
        placeholder="https://lien-vers-votre-livrable"
        style={{ padding: 8, minWidth: 280 }}
      />
      <Submit />
      {state.message && (
        <span role="status" style={{ color: state.ok ? "#0a7d33" : "#b00020" }}>
          {state.message}
        </span>
      )}
    </form>
  );
}
