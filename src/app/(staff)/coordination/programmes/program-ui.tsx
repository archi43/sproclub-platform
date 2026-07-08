"use client";

import { useFormState, useFormStatus } from "react-dom";
import { createProgramAction, togglePublishAction, type ProgramState } from "./actions";

const initial: ProgramState = { ok: false, message: "" };

function Submit({ idle, busy }: { idle: string; busy: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} style={{ padding: "6px 12px" }}>
      {pending ? busy : idle}
    </button>
  );
}

const input = { padding: 8, fontSize: 14 } as const;

/** Create-program form (Module 4). The 360L / syllabus / eval fields are
 *  required only to *publish* later; a program can be created without them. */
export function CreateProgramForm() {
  const [state, action] = useFormState(createProgramAction, initial);
  return (
    <form action={action} style={{ display: "grid", gap: 8, gridTemplateColumns: "1fr 1fr", maxWidth: 640 }}>
      <input name="name" required placeholder="Nom du programme *" style={{ ...input, gridColumn: "1 / -1" }} />
      <input name="specialty" placeholder="Spécialité" style={input} />
      <input name="family" placeholder="Famille (SAP, Odoo, HubSpot…)" style={input} />
      <input name="rncp" placeholder="Certification RNCP / RS" style={input} />
      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14 }}>
        <input type="checkbox" name="cpfEligible" /> Éligible CPF
      </label>
      <input name="path360l" placeholder="Parcours 360L (requis pour publier)" style={input} />
      <input name="syllabusUrl" placeholder="URL syllabus (requis pour publier)" style={input} />
      <input name="evalModalities" placeholder="Modalités d'évaluation (requis pour publier)" style={{ ...input, gridColumn: "1 / -1" }} />
      <div style={{ gridColumn: "1 / -1", display: "flex", gap: 12, alignItems: "center" }}>
        <Submit idle="Créer le programme" busy="Création…" />
        {state.message && <span role="status" style={{ color: state.ok ? "#0a7d33" : "#b00020" }}>{state.message}</span>}
      </div>
    </form>
  );
}

/** Publish / unpublish control for one program. */
export function PublishButton({ id, published }: { id: string; published: boolean }) {
  const [state, action] = useFormState(togglePublishAction, initial);
  return (
    <form action={action} style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="publish" value={String(!published)} />
      <Submit idle={published ? "Dépublier" : "Publier"} busy="…" />
      {state.message && <span role="status" style={{ color: state.ok ? "#0a7d33" : "#b00020", fontSize: 13 }}>{state.message}</span>}
    </form>
  );
}
