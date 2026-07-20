"use client";

import { useFormState, useFormStatus } from "react-dom";
import { saveVisibilityAction, type VisibilityState } from "./actions";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/form";
import { Alert } from "@/components/ui/alert";

const initial: VisibilityState = { ok: false, message: "" };

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Enregistrement…" : "Enregistrer"}
    </Button>
  );
}

export interface VisibilityFormValues {
  consented: boolean;
  availableFrom: string | null;
  contractSought: string | null;
  mobility: string | null;
}

/** Consentement (révocable) + disponibilité déclarative de l'apprenant. */
export function VisibilityForm({ values }: { values: VisibilityFormValues }) {
  const [state, action] = useFormState(saveVisibilityAction, initial);
  return (
    <form action={action} className="space-y-4">
      <label className="flex min-h-11 items-start gap-3">
        <input
          type="checkbox"
          name="consent"
          defaultChecked={values.consented}
          className="mt-1 h-5 w-5 rounded border-line accent-brand"
        />
        <span className="text-sm text-ink">
          J&apos;accepte que mon nom, ma progression, mes résultats d&apos;évaluation (synthèse chiffrée)
          et ma disponibilité soient visibles des <strong>entreprises partenaires</strong> de
          l&apos;organisme, actuelles et futures.
          <span className="block text-muted">
            Consentement révocable à tout moment en décochant cette case. Les commentaires de vos coachs
            et jurys ne sont jamais partagés.
          </span>
        </span>
      </label>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Disponible à partir du" htmlFor="vis-available-from">
          <Input id="vis-available-from" name="availableFrom" type="date" defaultValue={values.availableFrom ?? ""} />
        </Field>
        <Field label="Contrat recherché" htmlFor="vis-contract">
          <Select id="vis-contract" name="contractSought" defaultValue={values.contractSought ?? ""}>
            <option value="">—</option>
            <option value="CDI">CDI</option>
            <option value="CDD">CDD</option>
            <option value="Mission freelance">Mission freelance</option>
            <option value="Alternance">Alternance</option>
            <option value="Stage">Stage</option>
          </Select>
        </Field>
        <Field label="Mobilité" htmlFor="vis-mobility">
          <Input id="vis-mobility" name="mobility" placeholder="ex. Full remote, Île-de-France…" defaultValue={values.mobility ?? ""} />
        </Field>
      </div>

      <Submit />
      {state.message && <Alert tone={state.ok ? "success" : "error"}>{state.message}</Alert>}
    </form>
  );
}
