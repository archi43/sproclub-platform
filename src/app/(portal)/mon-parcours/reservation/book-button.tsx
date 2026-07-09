"use client";

import { useFormState, useFormStatus } from "react-dom";
import { bookCoachingAction, type BookState } from "./actions";
import { Button } from "@/components/ui/button";

const initial: BookState = { ok: false, message: "" };

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Réservation…" : "Réserver"}
    </Button>
  );
}

/** Booking control for a single coaching slot. */
export function BookButton({ availabilityId }: { availabilityId: string }) {
  const [state, action] = useFormState(bookCoachingAction, initial);
  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="availabilityId" value={availabilityId} />
      <Submit />
      {state.message && (
        <span role="status" className={state.ok ? "text-sm text-success" : "text-sm text-error"}>
          {state.message}
        </span>
      )}
    </form>
  );
}
