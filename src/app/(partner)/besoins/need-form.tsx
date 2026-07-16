"use client";

import { useFormState, useFormStatus } from "react-dom";
import { createTrainingNeedAction, type NeedActionState } from "./actions";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/form";
import { Alert } from "@/components/ui/alert";

const initial: NeedActionState = { ok: false, message: "" };

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Envoi…" : "Transmettre le besoin"}
    </Button>
  );
}

/** Expression d'un besoin de formation par l'entreprise partenaire. */
export function TrainingNeedForm() {
  const [state, action] = useFormState(createTrainingNeedAction, initial);
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2">
      <Field label="Compétence / domaine recherché" htmlFor="need-title">
        <Input id="need-title" name="title" required placeholder="ex. Consultants SAP S/4HANA EWM" />
      </Field>
      <Field label="Nombre de profils" htmlFor="need-headcount">
        <Input id="need-headcount" name="headcount" type="number" min={1} inputMode="numeric" placeholder="ex. 5" />
      </Field>
      <Field label="Échéance souhaitée" htmlFor="need-timeframe">
        <Input id="need-timeframe" name="timeframe" placeholder="ex. T1 2027, dès que possible…" />
      </Field>
      <div className="sm:col-span-2">
        <Field label="Précisions (contexte, séniorité, technologies…)" htmlFor="need-description">
          <Textarea id="need-description" name="description" rows={4} placeholder="Décrivez votre besoin pour orienter nos formations." />
        </Field>
      </div>
      <div className="flex items-center gap-3 sm:col-span-2">
        <Submit />
        {state.message && <Alert tone={state.ok ? "success" : "error"}>{state.message}</Alert>}
      </div>
    </form>
  );
}
