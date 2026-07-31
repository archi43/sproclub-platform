"use client";

import { useFormState, useFormStatus } from "react-dom";
import {
  addRuleAction,
  addBlockAction,
  saveFeedAction,
  type ActionState,
} from "./actions";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/form";
import { Alert } from "@/components/ui/alert";

const initial: ActionState = { ok: false, message: "" };

/** Jours affichés dans l'ordre de la semaine française ; la valeur reste
 *  l'index Postgres (`extract(dow)`, 0 = dimanche). */
export const WEEKDAYS: { value: number; label: string }[] = [
  { value: 1, label: "Lundi" },
  { value: 2, label: "Mardi" },
  { value: 3, label: "Mercredi" },
  { value: 4, label: "Jeudi" },
  { value: 5, label: "Vendredi" },
  { value: 6, label: "Samedi" },
  { value: 0, label: "Dimanche" },
];

function Submit({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? pendingLabel : label}
    </Button>
  );
}

function Feedback({ state }: { state: ActionState }) {
  if (!state.message) return null;
  return <Alert tone={state.ok ? "success" : "error"}>{state.message}</Alert>;
}

/** Plage récurrente hebdomadaire. */
export function RuleForm({ basePath }: { basePath: string }) {
  const [state, action] = useFormState(addRuleAction, initial);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="basePath" value={basePath} />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Type de rendez-vous">
          <Select name="kind" defaultValue="coaching">
            <option value="coaching">Coaching</option>
            <option value="defense">Soutenance</option>
          </Select>
        </Field>
        <Field label="Jour">
          <Select name="weekday" defaultValue="2">
            {WEEKDAYS.map((d) => (
              <option key={d.value} value={d.value}>{d.label}</option>
            ))}
          </Select>
        </Field>
        <Field label="Durée d'un créneau">
          <Select name="slotMinutes" defaultValue="60">
            <option value="30">30 minutes</option>
            <option value="45">45 minutes</option>
            <option value="60">1 heure</option>
            <option value="90">1 h 30</option>
            <option value="120">2 heures</option>
          </Select>
        </Field>
        <Field label="De">
          <Input type="time" name="startTime" defaultValue="14:00" required />
        </Field>
        <Field label="À">
          <Input type="time" name="endTime" defaultValue="17:00" required />
        </Field>
      </div>
      <Feedback state={state} />
      <Submit label="Ajouter la plage" pendingLabel="Ajout…" />
    </form>
  );
}

/** Exception ponctuelle : congé (fermeture) ou ouverture exceptionnelle. */
export function BlockForm({ basePath }: { basePath: string }) {
  const [state, action] = useFormState(addBlockAction, initial);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="basePath" value={basePath} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nature">
          <Select name="effect" defaultValue="closed">
            <option value="closed">Indisponible (congé, absence)</option>
            <option value="open">Disponibilité exceptionnelle</option>
          </Select>
        </Field>
        <Field label="Type de rendez-vous">
          <Select name="kind" defaultValue="">
            <option value="">Tous</option>
            <option value="coaching">Coaching</option>
            <option value="defense">Soutenance</option>
          </Select>
        </Field>
        <Field label="Du">
          <Input type="datetime-local" name="startsAt" required />
        </Field>
        <Field label="Au">
          <Input type="datetime-local" name="endsAt" required />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Motif (facultatif)">
            <Input name="reason" placeholder="Congés, formation, déplacement…" />
          </Field>
        </div>
      </div>
      <Feedback state={state} />
      <Submit label="Enregistrer" pendingLabel="Enregistrement…" />
    </form>
  );
}

/** Lien privé d'agenda externe (lecture seule). */
export function FeedForm({ basePath, currentUrl }: { basePath: string; currentUrl?: string | null }) {
  const [state, action] = useFormState(saveFeedAction, initial);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="basePath" value={basePath} />
      <Field label="Adresse privée au format iCal (.ics)">
        <Input
          name="icsUrl"
          type="url"
          inputMode="url"
          placeholder={currentUrl ? "Remplacer le lien enregistré…" : "https://calendar.google.com/calendar/ical/…/basic.ics"}
          required
        />
      </Field>
      <p className="text-sm text-muted">
        Ce lien donne accès à votre agenda : il n&apos;est visible que par vous, jamais par la
        coordination. Nous n&apos;en lisons que les horaires occupés — ni les titres, ni les participants.
      </p>
      <Feedback state={state} />
      <Submit label="Enregistrer l'agenda" pendingLabel="Enregistrement…" />
    </form>
  );
}
