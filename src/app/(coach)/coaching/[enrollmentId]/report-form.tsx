"use client";

import { useFormState, useFormStatus } from "react-dom";
import { createReportAction, type ReportState } from "./actions";
import { Button } from "@/components/ui/button";
import { Input, Textarea, Field } from "@/components/ui/form";
import { Alert } from "@/components/ui/alert";

const initial: ReportState = { ok: false, message: "" };

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Enregistrement…" : "Enregistrer le compte rendu"}
    </Button>
  );
}

/** Coach form to add a session report / note for one of their dossiers. */
export function ReportForm({ enrollmentId }: { enrollmentId: string }) {
  const [state, action] = useFormState(createReportAction, initial);
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2">
      <input type="hidden" name="enrollmentId" value={enrollmentId} />
      <Field label="Date de la séance" htmlFor="report-date">
        <Input id="report-date" name="sessionDate" type="date" />
      </Field>
      <Field label="Note (facultatif)" htmlFor="report-grade">
        <Input id="report-grade" name="grade" inputMode="decimal" placeholder="ex. 3,5" />
      </Field>
      <div className="sm:col-span-2">
        <Field label="Compte rendu" htmlFor="report-body">
          <Textarea id="report-body" name="body" required placeholder="Points travaillés, progression, prochaines étapes…" />
        </Field>
      </div>
      <div className="flex items-center gap-3 sm:col-span-2">
        <Submit />
        {state.message && <Alert tone={state.ok ? "success" : "error"}>{state.message}</Alert>}
      </div>
    </form>
  );
}
