"use client";

import { useFormState, useFormStatus } from "react-dom";
import { moderateOfferAction, reviewNeedAction, type ModerationState } from "./actions";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/form";
import type { JobStatus } from "@/lib/job-rules";
import type { TrainingNeedStatus } from "@/lib/data/jobs";

const initial: ModerationState = { ok: false, message: "" };

function Pending({ idle, variant = "primary", name, value }: {
  idle: string;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  name?: string;
  value?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" variant={variant} disabled={pending} name={name} value={value}>
      {pending ? "…" : idle}
    </Button>
  );
}

function Msg({ state }: { state: ModerationState }) {
  if (!state.message) return null;
  return <span className={state.ok ? "text-xs text-success" : "text-xs text-error"}>{state.message}</span>;
}

/** Actions de modération d'une offre (publier / rejeter avec motif / archiver). */
export function OfferModeration({ offerId, status }: { offerId: string; status: JobStatus }) {
  const [state, action] = useFormState(moderateOfferAction, initial);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="offerId" value={offerId} />
      <input type="hidden" name="from" value={status} />
      {status === "pending" && (
        <>
          <Input name="note" placeholder="Motif (si rejet)" className="w-44" aria-label="Motif de rejet" />
          <Pending idle="Publier" name="to" value="published" />
          <Pending idle="Rejeter" variant="danger" name="to" value="rejected" />
        </>
      )}
      {status === "published" && <Pending idle="Dépublier" variant="ghost" name="to" value="archived" />}
      {(status === "rejected" || status === "archived") && <Pending idle="Publier" name="to" value="published" />}
      <Msg state={state} />
    </form>
  );
}

/** Statut de suivi d'un besoin de formation. */
export function NeedReview({ needId, status }: { needId: string; status: TrainingNeedStatus }) {
  const [state, action] = useFormState(reviewNeedAction, initial);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="needId" value={needId} />
      <Select name="status" defaultValue={status} aria-label="Statut du besoin" className="w-40">
        <option value="open">Transmis</option>
        <option value="reviewed">Pris en compte</option>
        <option value="closed">Clôturé</option>
      </Select>
      <Pending idle="Mettre à jour" variant="secondary" />
      <Msg state={state} />
    </form>
  );
}
