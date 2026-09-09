"use client";

import { useFormState, useFormStatus } from "react-dom";
import { submitEvaluation, type EvaluationState } from "./actions";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Field, Select, Textarea } from "@/components/ui/form";
import { gradeScale, COMMENT_MIN_LENGTH } from "@/lib/jury-rules";

const initialState: EvaluationState = { ok: false, message: "" };

function Submit({ existing }: { existing: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} size="sm">
      {pending ? "Enregistrement…" : existing ? "Corriger mon appréciation" : "Déposer mon appréciation"}
    </Button>
  );
}

/**
 * Saisie d'une appréciation de jury.
 *
 * La note passe par une liste fermée plutôt qu'un champ libre : le barème au
 * demi-point est une règle d'évaluation, pas une préférence de saisie, et une
 * note hors barème rendrait les moyennes incomparables.
 */
export function EvaluationForm({ reservationId, enrollmentId, sessionDate, grade, body }: {
  reservationId: string;
  enrollmentId: string;
  sessionDate: string;
  grade: number | null;
  body: string;
}) {
  const [state, action] = useFormState(submitEvaluation, initialState);
  const existing = grade !== null || body !== "";

  return (
    <form action={action} className="mt-4 space-y-4 border-t border-line pt-4">
      <input type="hidden" name="reservationId" value={reservationId} />
      <input type="hidden" name="enrollmentId" value={enrollmentId} />
      <input type="hidden" name="sessionDate" value={sessionDate} />

      <div className="grid gap-4 sm:grid-cols-[10rem_1fr]">
        <Field label="Note sur 4" htmlFor={`grade-${reservationId}`}>
          <Select id={`grade-${reservationId}`} name="grade" defaultValue={grade != null ? String(grade) : ""} required>
            <option value="">—</option>
            {gradeScale().map((v) => (
              <option key={v} value={v}>{v.toString().replace(".", ",")}</option>
            ))}
          </Select>
        </Field>

        <Field label="Appréciation" htmlFor={`comment-${reservationId}`}>
          <Textarea
            id={`comment-${reservationId}`}
            name="comment"
            defaultValue={body}
            required
            minLength={COMMENT_MIN_LENGTH}
            maxLength={4000}
            placeholder="Ce qui a été démontré, ce qui reste à consolider…"
          />
        </Field>
      </div>

      <div className="flex items-center gap-3">
        <Submit existing={existing} />
        {state.message && (
          <Alert tone={state.ok ? "success" : "error"} className="flex-1">{state.message}</Alert>
        )}
      </div>
    </form>
  );
}
