"use client";

import { useFormState, useFormStatus } from "react-dom";
import { createOfferAction, partnerOfferTransitionAction, type OfferActionState } from "./actions";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea, Select } from "@/components/ui/form";
import { Alert } from "@/components/ui/alert";

const initial: OfferActionState = { ok: false, message: "" };

function Submit({ idle, busy, variant = "primary", size = "sm" }: { idle: string; busy: string; variant?: "primary" | "secondary" | "ghost"; size?: "sm" | "md" }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size={size} variant={variant} disabled={pending}>
      {pending ? busy : idle}
    </Button>
  );
}

/** Formulaire de création d'offre (partenaire). */
export function CreateOfferForm() {
  const [state, action] = useFormState(createOfferAction, initial);
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2">
      <Field label="Intitulé du poste" htmlFor="offer-title">
        <Input id="offer-title" name="title" required placeholder="ex. Consultant SAP MM junior" />
      </Field>
      <Field label="Type de contrat" htmlFor="offer-contract">
        <Select id="offer-contract" name="contractType" defaultValue="">
          <option value="">—</option>
          <option value="CDI">CDI</option>
          <option value="CDD">CDD</option>
          <option value="Alternance">Alternance</option>
          <option value="Mission freelance">Mission freelance</option>
          <option value="Stage">Stage</option>
        </Select>
      </Field>
      <Field label="Localisation" htmlFor="offer-location">
        <Input id="offer-location" name="location" placeholder="ex. Paris" />
      </Field>
      <Field label="Télétravail" htmlFor="offer-remote">
        <Input id="offer-remote" name="remote" placeholder="ex. Full remote, Hybride…" />
      </Field>
      <div className="sm:col-span-2">
        <Field label="Description" htmlFor="offer-description">
          <Textarea id="offer-description" name="description" required rows={5} placeholder="Missions, compétences attendues, contexte…" />
        </Field>
      </div>
      <div className="flex items-center gap-3 sm:col-span-2">
        <Submit idle="Soumettre l'offre" busy="Envoi…" />
        {state.message && <Alert tone={state.ok ? "success" : "error"}>{state.message}</Alert>}
      </div>
    </form>
  );
}

/** Bouton de transition (archiver / re-soumettre) piloté par le trigger serveur. */
export function OfferTransitionButton({ offerId, status, label, variant = "ghost" }: { offerId: string; status: "archived" | "pending"; label: string; variant?: "secondary" | "ghost" }) {
  const [state, action] = useFormState(partnerOfferTransitionAction, initial);
  return (
    <form action={action} className="inline-flex items-center gap-2">
      <input type="hidden" name="offerId" value={offerId} />
      <input type="hidden" name="status" value={status} />
      <Submit idle={label} busy="…" variant={variant} />
      {state.message && !state.ok && <span className="text-xs text-error">{state.message}</span>}
    </form>
  );
}
