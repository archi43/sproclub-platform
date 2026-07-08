"use client";

import { useFormState, useFormStatus } from "react-dom";
import { bookCoachingAction, type BookState } from "./actions";

const initial: BookState = { ok: false, message: "" };

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} style={{ padding: "6px 12px" }}>
      {pending ? "Réservation…" : "Réserver"}
    </button>
  );
}

/** Booking control for a single coaching slot. */
export function BookButton({ availabilityId }: { availabilityId: string }) {
  const [state, action] = useFormState(bookCoachingAction, initial);
  return (
    <form action={action} style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
      <input type="hidden" name="availabilityId" value={availabilityId} />
      <Submit />
      {state.message && (
        <span role="status" style={{ color: state.ok ? "#0a7d33" : "#b00020" }}>
          {state.message}
        </span>
      )}
    </form>
  );
}
