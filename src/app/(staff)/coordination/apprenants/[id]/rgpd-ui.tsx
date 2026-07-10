"use client";

import { useFormState, useFormStatus } from "react-dom";
import { eraseLearnerAction, type RgpdState } from "./rgpd-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form";
import { Alert } from "@/components/ui/alert";

const initial: RgpdState = { ok: false, message: "" };

function EraseButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" variant="danger" disabled={pending}>
      {pending ? "Effacement…" : "Effacer le dossier"}
    </Button>
  );
}

/** Right-to-erasure control (direction only). Requires typing EFFACER. */
export function EraseLearner({ learnerId }: { learnerId: string }) {
  const [state, action] = useFormState(eraseLearnerAction, initial);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="learnerId" value={learnerId} />
      <Input
        name="confirm"
        placeholder="Tapez EFFACER"
        aria-label="Confirmation d'effacement"
        aria-describedby="erase-help"
        className="w-40"
        autoComplete="off"
      />
      <EraseButton />
      <span id="erase-help" className="w-full text-xs text-grey-600">
        Action irréversible : tapez <strong>EFFACER</strong> pour anonymiser définitivement ce dossier.
      </span>
      {state.message && <Alert tone={state.ok ? "success" : "error"}>{state.message}</Alert>}
    </form>
  );
}
