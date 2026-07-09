"use client";

import { useFormState, useFormStatus } from "react-dom";
import {
  inviteMemberAction,
  grantRoleAction,
  revokeRoleAction,
  deactivateMemberAction,
  reactivateMemberAction,
  addPoolAction,
  removePoolAction,
  type ActionState,
} from "./actions";
import { Button } from "@/components/ui/button";
import { Input, Select, Field } from "@/components/ui/form";
import { Alert } from "@/components/ui/alert";
import { ROLE_ORDER, roleLabel } from "@/lib/roles";
import type { AppRole } from "@/lib/types";
import type { EvaluatorCandidate } from "@/lib/data/evaluators";

const initial: ActionState = { ok: false, message: "" };

function Submit({ idle, busy, variant, size = "sm" }: {
  idle: string;
  busy: string;
  variant?: "primary" | "accent" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size={size} variant={variant} disabled={pending}>
      {pending ? busy : idle}
    </Button>
  );
}

function Msg({ state }: { state: ActionState }) {
  if (!state.message) return null;
  return (
    <span role="status" className={state.ok ? "text-sm text-success" : "text-sm text-error"}>
      {state.message}
    </span>
  );
}

/** Invite / provision a user with an initial role. `canCreateDirection` hides the
 *  direction option for a coordinator (also enforced server-side + by RLS). */
export function InviteForm({ canCreateDirection }: { canCreateDirection: boolean }) {
  const [state, action] = useFormState(inviteMemberAction, initial);
  const roles = ROLE_ORDER.filter((r) => canCreateDirection || r !== "direction");
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2">
      <Field label="Adresse e-mail" htmlFor="invite-email">
        <Input id="invite-email" name="email" type="email" required placeholder="prenom.nom@exemple.fr" autoComplete="off" />
      </Field>
      <Field label="Nom complet" htmlFor="invite-name">
        <Input id="invite-name" name="fullName" placeholder="Prénom Nom" autoComplete="off" />
      </Field>
      <Field label="Rôle" htmlFor="invite-role">
        <Select id="invite-role" name="role" defaultValue="coach" required>
          {roles.map((r) => (
            <option key={r} value={r}>{roleLabel(r)}</option>
          ))}
        </Select>
      </Field>
      <div className="flex items-center gap-3 sm:col-span-2">
        <Submit idle="Inviter" busy="Invitation…" />
        <Msg state={state} />
      </div>
    </form>
  );
}

/** Add a role to an existing member (roles they don't already hold). */
export function AddRoleForm({ profileId, available }: { profileId: string; available: AppRole[] }) {
  const [state, action] = useFormState(grantRoleAction, initial);
  if (available.length === 0) return null;
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="profileId" value={profileId} />
      <Select name="role" aria-label="Rôle à ajouter" defaultValue={available[0]} className="h-8 w-auto py-1 text-xs">
        {available.map((r) => (
          <option key={r} value={r}>{roleLabel(r)}</option>
        ))}
      </Select>
      <Submit idle="Ajouter" busy="…" variant="secondary" />
      <Msg state={state} />
    </form>
  );
}

/** A role chip that is itself the "revoke this role" form (badge-like), so we
 *  avoid nesting a <form> inside a <span> badge. The × is the submit control. */
export function RoleChip({ profileId, role, removable, tone = "neutral" }: {
  profileId: string;
  role: AppRole;
  removable: boolean;
  tone?: "neutral" | "brand";
}) {
  const [state, action] = useFormState(revokeRoleAction, initial);
  const base = tone === "brand" ? "bg-brand text-white" : "bg-brand-tint text-brand";
  return (
    <span className="inline-flex flex-col gap-0.5">
      <form
        action={action}
        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${base}`}
      >
        <input type="hidden" name="profileId" value={profileId} />
        <input type="hidden" name="role" value={role} />
        <span>{roleLabel(role)}</span>
        {removable && <RemoveIcon label={`Retirer le rôle ${roleLabel(role)}`} />}
      </form>
      {state.message && !state.ok && (
        <span role="status" className="text-xs text-error">{state.message}</span>
      )}
    </span>
  );
}

function RemoveIcon({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-label={label}
      title={label}
      className="rounded-full px-0.5 leading-none opacity-80 hover:opacity-100 focus-visible:opacity-100 disabled:opacity-40"
    >
      ×
    </button>
  );
}

/** Deactivate / reactivate an account. */
export function AccountToggle({ profileId, active }: { profileId: string; active: boolean }) {
  const [state, action] = useFormState(
    active ? deactivateMemberAction : reactivateMemberAction,
    initial
  );
  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="profileId" value={profileId} />
      <Submit
        idle={active ? "Désactiver" : "Réactiver"}
        busy="…"
        variant={active ? "danger" : "secondary"}
      />
      {state.message && !state.ok && <Msg state={state} />}
    </form>
  );
}

/** Add an evaluator to a program's pool. */
export function AddPoolForm({ programs, candidates }: { programs: string[]; candidates: EvaluatorCandidate[] }) {
  const [state, action] = useFormState(addPoolAction, initial);
  if (candidates.length === 0) {
    return (
      <Alert tone="info">
        Aucun évaluateur disponible. Invitez d'abord une personne avec le rôle « Évaluateur ».
      </Alert>
    );
  }
  if (programs.length === 0) {
    return <Alert tone="info">Créez d'abord un programme dans le catalogue.</Alert>;
  }
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-3">
      <Field label="Programme" htmlFor="pool-program">
        <Select id="pool-program" name="program" required defaultValue={programs[0]}>
          {programs.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </Select>
      </Field>
      <Field label="Évaluateur" htmlFor="pool-eval">
        <Select id="pool-eval" name="evaluatorId" required defaultValue={candidates[0].profileId}>
          {candidates.map((c) => (
            <option key={c.profileId} value={c.profileId}>{c.fullName ? `${c.fullName} — ${c.email}` : c.email}</option>
          ))}
        </Select>
      </Field>
      <div className="flex items-end gap-3">
        <Submit idle="Ajouter au vivier" busy="Ajout…" />
      </div>
      <div className="sm:col-span-3"><Msg state={state} /></div>
    </form>
  );
}

/** Remove an evaluator from a program's pool (rendered per pool row). */
export function RemovePoolButton({ program, evaluatorId }: { program: string; evaluatorId: string }) {
  const [state, action] = useFormState(removePoolAction, initial);
  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="program" value={program} />
      <input type="hidden" name="evaluatorId" value={evaluatorId} />
      <Submit idle="Retirer" busy="…" variant="ghost" />
      {state.message && !state.ok && <Msg state={state} />}
    </form>
  );
}
