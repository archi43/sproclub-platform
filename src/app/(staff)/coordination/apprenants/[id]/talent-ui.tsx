"use client";

import { useFormState, useFormStatus } from "react-dom";
import { setTalentStatusAction, type TalentActionState } from "./talent-actions";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/form";

const initial: TalentActionState = { ok: false, message: "" };

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Mise à jour…" : "Mettre à jour"}
    </Button>
  );
}

/** Sélecteur du statut vivier (coordination) sur la fiche apprenant. */
export function TalentStatusForm({ learnerId, current }: { learnerId: string; current: string | null }) {
  const [state, action] = useFormState(setTalentStatusAction, initial);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="learnerId" value={learnerId} />
      <Select name="status" defaultValue={current ?? ""} aria-label="Statut vivier" className="w-56">
        <option value="">— (calculé : formation/déclaratif)</option>
        <option value="searching">En recherche</option>
        <option value="employed">En poste</option>
        <option value="unavailable">Indisponible</option>
      </Select>
      <Submit />
      {state.message && (
        <span role="status" className={state.ok ? "text-sm text-success" : "text-sm text-error"}>
          {state.message}
        </span>
      )}
    </form>
  );
}
