"use client";

import { useFormState, useFormStatus } from "react-dom";
import { addOptOutAction, removeOptOutAction, type PrefState } from "./actions";
import { NOTIFICATION_KINDS, kindLabel } from "@/lib/notification-rules";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/form";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";

const initial: PrefState = { ok: false, message: "" };

function AddButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Enregistrement…" : "Désactiver la relance"}
    </Button>
  );
}

export interface OptOutView {
  id: string;
  email: string;
  kind: string;
}

/** Opt-out management (direction/coordinator). Add or remove a recipient's
 *  suppression for a given reminder kind. */
export function OptOutManager({ optOuts }: { optOuts: OptOutView[] }) {
  const [state, action] = useFormState(addOptOutAction, initial);
  return (
    <div className="space-y-4">
      <form action={action} className="flex flex-wrap items-end gap-2">
        <div>
          <label htmlFor="pref-email" className="mb-1 block text-xs text-grey-600">E-mail destinataire</label>
          <Input id="pref-email" name="email" type="email" placeholder="personne@exemple.fr" className="w-64" autoComplete="off" />
        </div>
        <div>
          <label htmlFor="pref-kind" className="mb-1 block text-xs text-grey-600">Type de relance</label>
          <Select id="pref-kind" name="kind" defaultValue="" className="w-auto">
            <option value="" disabled>Choisir…</option>
            {NOTIFICATION_KINDS.map((k) => (
              <option key={k.key} value={k.key}>{k.label}</option>
            ))}
          </Select>
        </div>
        <AddButton />
        {state.message && <Alert tone={state.ok ? "success" : "error"}>{state.message}</Alert>}
      </form>

      {optOuts.length === 0 ? (
        <p className="text-sm text-grey-600">Aucune relance désactivée : tous les destinataires reçoivent les relances.</p>
      ) : (
        <ul className="space-y-1">
          {optOuts.map((o) => (
            <li key={o.id} className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-ink">{o.email}</span>
              <Badge tone="neutral">{kindLabel(o.kind)}</Badge>
              <form action={removeOptOutAction}>
                <input type="hidden" name="id" value={o.id} />
                <button type="submit" className="text-xs text-grey-600 underline hover:text-brand">Réactiver</button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
