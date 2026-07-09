"use server";

import { revalidatePath } from "next/cache";
import { getOrgContext } from "@/lib/tenant";
import { getCurrentUser, getRolesForOrg } from "@/lib/auth";
import {
  MemberError,
  grantRole,
  revokeRole,
  deactivateMember,
  reactivateMember,
} from "@/lib/data/members";
import { addToPool, removeFromPool } from "@/lib/data/evaluators";
import { inviteMember } from "@/lib/members/provision";
import type { AppRole } from "@/lib/types";

export type ActionState = { ok: boolean; message: string };

const PATH = "/coordination/administration";
const ROLES: AppRole[] = ["direction", "coordinator", "coach", "evaluator", "student"];

/**
 * Resolve org + acting user + whether they hold direction, AND authorize.
 *
 * Server Actions are standalone POST endpoints: the (staff) layout guard only
 * gates page rendering, not a direct call to an action. Most mutations here go
 * through the RLS client, where `membership_manage` (0012) is the real guard —
 * but `inviteMemberAction` provisions via the service-role client, which
 * BYPASSES RLS. So we must re-check authorization here: only direction /
 * coordinator of the active org may proceed. Fails closed otherwise.
 */
async function staffContext(): Promise<
  | { ok: true; orgId: string; userId: string; isDirection: boolean }
  | { ok: false; state: ActionState }
> {
  const org = await getOrgContext();
  if (!org) return { ok: false, state: { ok: false, message: "Organisme introuvable." } };
  const user = await getCurrentUser();
  if (!user) return { ok: false, state: { ok: false, message: "Session expirée, reconnectez-vous." } };
  const roles = await getRolesForOrg(org.id);
  const isDirection = roles.includes("direction");
  const isStaff = isDirection || roles.includes("coordinator");
  if (!isStaff) return { ok: false, state: { ok: false, message: "Accès refusé." } };
  return { ok: true, orgId: org.id, userId: user.id, isDirection };
}

function parseRole(value: FormDataEntryValue | null): AppRole | null {
  const v = String(value ?? "");
  return (ROLES as string[]).includes(v) ? (v as AppRole) : null;
}

function fail(err: unknown): ActionState {
  return { ok: false, message: err instanceof MemberError ? err.message : "Erreur inattendue." };
}

/** Invite (provision) a user with an initial role. */
export async function inviteMemberAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await staffContext();
  if (!ctx.ok) return ctx.state;

  const email = String(formData.get("email") ?? "").trim();
  const fullName = String(formData.get("fullName") ?? "").trim() || null;
  const role = parseRole(formData.get("role"));
  if (!email) return { ok: false, message: "L'adresse e-mail est requise." };
  if (!role) return { ok: false, message: "Rôle invalide." };
  // Only a director may create another director.
  if (role === "direction" && !ctx.isDirection) {
    return { ok: false, message: "Seule la direction peut créer un compte de direction." };
  }

  let created: boolean;
  try {
    ({ created } = await inviteMember({
      orgId: ctx.orgId,
      email,
      fullName,
      role,
      invitedBy: ctx.userId,
    }));
  } catch (err) {
    return fail(err);
  }
  revalidatePath(PATH);
  return {
    ok: true,
    message: created
      ? "Compte créé et invité. La personne se connecte via le lien e-mail."
      : "Rôle attribué à un compte existant.",
  };
}

export async function grantRoleAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await staffContext();
  if (!ctx.ok) return ctx.state;
  const profileId = String(formData.get("profileId") ?? "");
  const role = parseRole(formData.get("role"));
  if (!profileId) return { ok: false, message: "Membre introuvable." };
  if (!role) return { ok: false, message: "Rôle invalide." };
  if (role === "direction" && !ctx.isDirection) {
    return { ok: false, message: "Seule la direction peut attribuer le rôle de direction." };
  }
  try {
    await grantRole(ctx.orgId, profileId, role, ctx.userId, ctx.isDirection);
  } catch (err) {
    return fail(err);
  }
  revalidatePath(PATH);
  return { ok: true, message: "Rôle attribué." };
}

export async function revokeRoleAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await staffContext();
  if (!ctx.ok) return ctx.state;
  const profileId = String(formData.get("profileId") ?? "");
  const role = parseRole(formData.get("role"));
  if (!profileId || !role) return { ok: false, message: "Action invalide." };
  try {
    await revokeRole(ctx.orgId, profileId, role, ctx.isDirection);
  } catch (err) {
    return fail(err);
  }
  revalidatePath(PATH);
  return { ok: true, message: "Rôle retiré." };
}

export async function deactivateMemberAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await staffContext();
  if (!ctx.ok) return ctx.state;
  const profileId = String(formData.get("profileId") ?? "");
  if (!profileId) return { ok: false, message: "Membre introuvable." };
  try {
    await deactivateMember(ctx.orgId, profileId, ctx.userId, ctx.isDirection);
  } catch (err) {
    return fail(err);
  }
  revalidatePath(PATH);
  return { ok: true, message: "Compte désactivé." };
}

export async function reactivateMemberAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await staffContext();
  if (!ctx.ok) return ctx.state;
  const profileId = String(formData.get("profileId") ?? "");
  if (!profileId) return { ok: false, message: "Membre introuvable." };
  try {
    await reactivateMember(ctx.orgId, profileId, ctx.isDirection);
  } catch (err) {
    return fail(err);
  }
  revalidatePath(PATH);
  return { ok: true, message: "Compte réactivé." };
}

export async function addPoolAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await staffContext();
  if (!ctx.ok) return ctx.state;
  const program = String(formData.get("program") ?? "").trim();
  const evaluatorId = String(formData.get("evaluatorId") ?? "");
  if (!program) return { ok: false, message: "Sélectionnez un programme." };
  if (!evaluatorId) return { ok: false, message: "Sélectionnez un évaluateur." };
  try {
    await addToPool(ctx.orgId, program, evaluatorId);
  } catch (err) {
    return fail(err);
  }
  revalidatePath(PATH);
  return { ok: true, message: "Évaluateur ajouté au vivier." };
}

export async function removePoolAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await staffContext();
  if (!ctx.ok) return ctx.state;
  const program = String(formData.get("program") ?? "");
  const evaluatorId = String(formData.get("evaluatorId") ?? "");
  if (!program || !evaluatorId) return { ok: false, message: "Action invalide." };
  try {
    await removeFromPool(ctx.orgId, program, evaluatorId);
  } catch (err) {
    return fail(err);
  }
  revalidatePath(PATH);
  return { ok: true, message: "Évaluateur retiré du vivier." };
}
