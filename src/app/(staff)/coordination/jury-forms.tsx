"use client";

import { useFormState, useFormStatus } from "react-dom";
import { assignEvaluatorAction, confirmDefenseAction, type CoordState } from "./actions";

const initial: CoordState = { ok: false, message: "" };

export interface Candidate {
  evaluatorId: string;
  label: string;
}

function Pending({ idle, busy }: { idle: string; busy: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} style={{ padding: "6px 12px" }}>
      {pending ? busy : idle}
    </button>
  );
}

/** Add an evaluator to a defense jury from the eligible pool. */
export function AssignForm({ reservationId, candidates }: { reservationId: string; candidates: Candidate[] }) {
  const [state, action] = useFormState(assignEvaluatorAction, initial);
  return (
    <form action={action} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      <input type="hidden" name="reservationId" value={reservationId} />
      <select name="evaluatorId" required defaultValue="" style={{ padding: 8 }}>
        <option value="" disabled>
          Choisir un évaluateur…
        </option>
        {candidates.map((c) => (
          <option key={c.evaluatorId} value={c.evaluatorId}>
            {c.label}
          </option>
        ))}
      </select>
      <Pending idle="Ajouter au jury" busy="Ajout…" />
      {state.message && (
        <span role="status" style={{ color: state.ok ? "#0a7d33" : "#b00020" }}>
          {state.message}
        </span>
      )}
    </form>
  );
}

/** Confirm a defense (requires exactly two evaluators, never the coach). */
export function ConfirmForm({ reservationId }: { reservationId: string }) {
  const [state, action] = useFormState(confirmDefenseAction, initial);
  return (
    <form action={action} style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
      <input type="hidden" name="reservationId" value={reservationId} />
      <Pending idle="Confirmer la soutenance" busy="Confirmation…" />
      {state.message && (
        <span role="status" style={{ color: state.ok ? "#0a7d33" : "#b00020" }}>
          {state.message}
        </span>
      )}
    </form>
  );
}
