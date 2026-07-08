"use client";

import { useFormState, useFormStatus } from "react-dom";
import { bookDefenseAction, type DefenseState } from "./actions";

const initial: DefenseState = { ok: false, message: "" };

export interface SlotOption {
  id: string;
  label: string;
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} style={{ padding: "6px 12px" }}>
      {pending ? "Réservation…" : "Réserver la soutenance"}
    </button>
  );
}

/** Defense booking for one eligible project: pick a slot, submit. */
export function DefenseForm({ projectNumber, slots }: { projectNumber: number; slots: SlotOption[] }) {
  const [state, action] = useFormState(bookDefenseAction, initial);
  return (
    <form action={action} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      <input type="hidden" name="projectNumber" value={projectNumber} />
      <select name="availabilityId" required defaultValue="" style={{ padding: 8 }}>
        <option value="" disabled>
          Choisir un créneau…
        </option>
        {slots.map((s) => (
          <option key={s.id} value={s.id}>
            {s.label}
          </option>
        ))}
      </select>
      <Submit />
      {state.message && (
        <span role="status" style={{ color: state.ok ? "#0a7d33" : "#b00020" }}>
          {state.message}
        </span>
      )}
    </form>
  );
}
