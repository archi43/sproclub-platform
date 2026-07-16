"use client";

import { useFormState, useFormStatus } from "react-dom";
import { toggleInterestAction, type InterestState } from "./actions";
import { Button } from "@/components/ui/button";

const initial: InterestState = { ok: false, message: "" };

function Submit({ interested }: { interested: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" variant={interested ? "secondary" : "primary"} disabled={pending}>
      {pending ? "…" : interested ? "Intérêt manifesté ✓ (retirer)" : "Je suis intéressé·e"}
    </Button>
  );
}

/** Bouton d'intérêt (un clic), bascule selon l'état courant. */
export function InterestButton({ offerId, interested }: { offerId: string; interested: boolean }) {
  const [state, action] = useFormState(toggleInterestAction, initial);
  return (
    <form action={action} className="inline-flex items-center gap-2">
      <input type="hidden" name="offerId" value={offerId} />
      <input type="hidden" name="interested" value={interested ? "false" : "true"} />
      <Submit interested={interested} />
      {state.message && !state.ok && <span className="text-xs text-error">{state.message}</span>}
    </form>
  );
}
