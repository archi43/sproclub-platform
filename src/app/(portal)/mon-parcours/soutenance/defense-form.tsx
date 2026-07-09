"use client";

import { useFormState, useFormStatus } from "react-dom";
import { bookDefenseAction, type DefenseState } from "./actions";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/form";

const initial: DefenseState = { ok: false, message: "" };

export interface SlotOption {
  id: string;
  label: string;
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Réservation…" : "Réserver la soutenance"}
    </Button>
  );
}

/** Defense booking for one eligible project: pick a slot, submit. */
export function DefenseForm({ projectNumber, slots }: { projectNumber: number; slots: SlotOption[] }) {
  const [state, action] = useFormState(bookDefenseAction, initial);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="projectNumber" value={projectNumber} />
      <div className="flex flex-wrap items-center gap-2">
        <Select name="availabilityId" required defaultValue="" aria-label="Créneau de soutenance" className="min-w-56">
          <option value="" disabled>
            Choisir un créneau…
          </option>
          {slots.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </Select>
        <Submit />
      </div>
      {state.message && (
        <span role="status" className={state.ok ? "text-sm text-success" : "text-sm text-error"}>
          {state.message}
        </span>
      )}
    </form>
  );
}
