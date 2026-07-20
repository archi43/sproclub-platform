"use client";

import { useFormState, useFormStatus } from "react-dom";
import { createProgramAction, togglePublishAction, type ProgramState } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form";
import { Alert } from "@/components/ui/alert";

const initial: ProgramState = { ok: false, message: "" };

function Submit({ idle, busy }: { idle: string; busy: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? busy : idle}
    </Button>
  );
}

/** Create-program form (Module 4). The 360L / syllabus / eval fields are
 *  required only to *publish* later; a program can be created without them. */
export function CreateProgramForm() {
  const [state, action] = useFormState(createProgramAction, initial);
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2">
      <Input name="name" required placeholder="Nom du programme *" className="sm:col-span-2" aria-label="Nom du programme" />
      <Input name="specialty" placeholder="Spécialité" aria-label="Spécialité" />
      <Input name="family" placeholder="Famille (SAP, Odoo, HubSpot…)" aria-label="Famille" />
      <Input name="rncp" placeholder="Certification RNCP / RS" aria-label="Certification RNCP/RS" />
      <label className="flex items-center gap-2 text-sm text-muted">
        <input type="checkbox" name="cpfEligible" className="accent-brand" /> Éligible CPF
      </label>
      <Input name="path360l" placeholder="Parcours 360L (requis pour publier)" aria-label="Parcours 360L" />
      <Input name="syllabusUrl" placeholder="URL syllabus (requis pour publier)" aria-label="URL syllabus" />
      <Input name="evalModalities" placeholder="Modalités d'évaluation (requis pour publier)" className="sm:col-span-2" aria-label="Modalités d'évaluation" />
      <div className="flex items-center gap-3 sm:col-span-2">
        <Submit idle="Créer le programme" busy="Création…" />
        {state.message && <Alert tone={state.ok ? "success" : "error"}>{state.message}</Alert>}
      </div>
    </form>
  );
}

/** Publish / unpublish control for one program. */
export function PublishButton({ id, published }: { id: string; published: boolean }) {
  const [state, action] = useFormState(togglePublishAction, initial);
  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="publish" value={String(!published)} />
      <Button type="submit" size="sm" variant={published ? "secondary" : "primary"}>
        {published ? "Dépublier" : "Publier"}
      </Button>
      {state.message && (
        <span role="status" className={state.ok ? "text-sm text-success" : "text-sm text-error"}>
          {state.message}
        </span>
      )}
    </form>
  );
}
