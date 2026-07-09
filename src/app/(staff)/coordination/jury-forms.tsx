"use client";

import { useFormState, useFormStatus } from "react-dom";
import { assignEvaluatorAction, confirmDefenseAction, type CoordState } from "./actions";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/form";

const initial: CoordState = { ok: false, message: "" };

export interface Candidate {
  evaluatorId: string;
  label: string;
}

function Pending({ idle, busy }: { idle: string; busy: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? busy : idle}
    </Button>
  );
}

function Msg({ state }: { state: CoordState }) {
  if (!state.message) return null;
  return (
    <span role="status" className={state.ok ? "text-sm text-success" : "text-sm text-error"}>
      {state.message}
    </span>
  );
}

/** Add an evaluator to a defense jury from the eligible pool. */
export function AssignForm({ reservationId, candidates }: { reservationId: string; candidates: Candidate[] }) {
  const [state, action] = useFormState(assignEvaluatorAction, initial);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="reservationId" value={reservationId} />
      <Select name="evaluatorId" required defaultValue="" aria-label="Évaluateur" className="min-w-56">
        <option value="" disabled>
          Choisir un évaluateur…
        </option>
        {candidates.map((c) => (
          <option key={c.evaluatorId} value={c.evaluatorId}>
            {c.label}
          </option>
        ))}
      </Select>
      <Pending idle="Ajouter au jury" busy="Ajout…" />
      <Msg state={state} />
    </form>
  );
}

/** Confirm a defense (requires exactly two evaluators, never the coach). */
export function ConfirmForm({ reservationId }: { reservationId: string }) {
  const [state, action] = useFormState(confirmDefenseAction, initial);
  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="reservationId" value={reservationId} />
      <Pending idle="Confirmer la soutenance" busy="Confirmation…" />
      <Msg state={state} />
    </form>
  );
}
