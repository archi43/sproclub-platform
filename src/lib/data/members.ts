import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { AppRole } from "@/lib/types";

/**
 * Member & role administration (INC-10), RLS-enforced.
 *
 * Reads and role mutations here run through the request-scoped client, so the
 * `membership_staff_read` / `membership_manage` policies (0012) are the real
 * guard: only direction / coordinator of the active org get through, and a
 * coordinator can never touch a `direction` membership. Provisioning a brand new
 * account (creating the auth user) is the one operation RLS cannot perform — it
 * lives in `@/lib/members/provision` behind the service role.
 *
 * `actorIsDirection` is threaded through the mutations: because an account may
 * mix roles (e.g. direction + coach), RLS alone would let a coordinator stamp
 * the coach row while leaving the direction row untouched — a partial, confusing
 * state. We forbid a non-director from managing any account that holds a
 * direction role, so a director-account is always managed atomically.
 */

/** A member rule violation surfaced from RLS / the DB, shown to the user. */
export class MemberError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MemberError";
  }
}

export interface MemberSummary {
  profileId: string;
  email: string;
  fullName: string | null;
  roles: AppRole[];
  /** Active if at least one membership row is not deactivated. */
  active: boolean;
  /** Earliest grant date across the member's roles. */
  since: string;
}

type Row = {
  profile_id: string;
  role: AppRole;
  created_at: string;
  deactivated_at: string | null;
  profile: { email: string; full_name: string | null } | null;
};

/** All members of the org, aggregated per person (one row per role → one card
 *  per profile). Ordered by e-mail for a stable, scannable list. */
export async function listMembers(orgId: string): Promise<MemberSummary[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("memberships")
    // Disambiguate the embed: memberships has THREE FKs to profiles since 0012
    // (profile_id, invited_by, deactivated_by). Name the intended constraint so
    // PostgREST doesn't error on the ambiguity.
    .select("profile_id, role, created_at, deactivated_at, profile:profiles!memberships_profile_id_fkey(email, full_name)")
    .eq("org_id", orgId);
  if (error) throw new Error(`Failed to load members: ${error.message}`);

  const byProfile = new Map<string, MemberSummary>();
  for (const r of (data ?? []) as unknown as Row[]) {
    const existing = byProfile.get(r.profile_id);
    if (existing) {
      existing.roles.push(r.role);
      if (r.deactivated_at === null) existing.active = true;
      if (r.created_at < existing.since) existing.since = r.created_at;
    } else {
      byProfile.set(r.profile_id, {
        profileId: r.profile_id,
        email: r.profile?.email ?? "",
        fullName: r.profile?.full_name ?? null,
        roles: [r.role],
        active: r.deactivated_at === null,
        since: r.created_at,
      });
    }
  }
  return [...byProfile.values()]
    .map((m) => ({ ...m, roles: [...new Set(m.roles)].sort() }))
    .sort((a, b) => a.email.localeCompare(b.email));
}

/** Number of ACTIVE direction accounts — used to prevent locking everyone out
 *  by removing / deactivating the last director. */
export async function countActiveDirections(orgId: string): Promise<number> {
  const supabase = createClient();
  const { count, error } = await supabase
    .from("memberships")
    .select("profile_id", { count: "exact", head: true })
    .eq("org_id", orgId)
    .eq("role", "direction")
    .is("deactivated_at", null);
  if (error) throw new Error(`Failed to count directions: ${error.message}`);
  return count ?? 0;
}

/** True if the profile holds a `direction` membership (active OR deactivated). */
async function holdsDirectionRole(orgId: string, profileId: string): Promise<boolean> {
  const supabase = createClient();
  const { count, error } = await supabase
    .from("memberships")
    .select("profile_id", { count: "exact", head: true })
    .eq("org_id", orgId)
    .eq("profile_id", profileId)
    .eq("role", "direction");
  if (error) throw new Error(`Failed to read membership: ${error.message}`);
  return (count ?? 0) > 0;
}

/** Only a director may manage a director-account (see module note). */
async function ensureManageable(orgId: string, profileId: string, actorIsDirection: boolean): Promise<void> {
  if (!actorIsDirection && (await holdsDirectionRole(orgId, profileId))) {
    throw new MemberError("Seule la direction peut gérer un compte de direction.");
  }
}

/** Grant a role to an existing member. `grantedBy` is recorded for the audit
 *  trail (CA-T3). RLS refuses the write for anyone but direction / coordinator
 *  (and a coordinator granting `direction`). */
export async function grantRole(
  orgId: string,
  profileId: string,
  role: AppRole,
  grantedBy: string,
  actorIsDirection: boolean
): Promise<void> {
  await ensureManageable(orgId, profileId, actorIsDirection);
  const supabase = createClient();
  const { error } = await supabase.from("memberships").insert({
    org_id: orgId,
    profile_id: profileId,
    role,
    invited_by: grantedBy,
  });
  if (error) {
    if (error.code === "23505") throw new MemberError("Cette personne a déjà ce rôle.");
    if (error.code === "42501") throw new MemberError("Vous n'êtes pas autorisé à attribuer ce rôle.");
    throw new MemberError(error.message);
  }
}

/** Revoke a single role from a member. Refuses to remove the last active
 *  director. RLS blocks a coordinator from revoking a `direction` row. */
export async function revokeRole(
  orgId: string,
  profileId: string,
  role: AppRole,
  actorIsDirection: boolean
): Promise<void> {
  await ensureManageable(orgId, profileId, actorIsDirection);
  if (role === "direction" && (await countActiveDirections(orgId)) <= 1) {
    throw new MemberError("Impossible de retirer le dernier compte de direction actif.");
  }
  const supabase = createClient();
  const { error } = await supabase
    .from("memberships")
    .delete()
    .eq("org_id", orgId)
    .eq("profile_id", profileId)
    .eq("role", role);
  if (error) {
    if (error.code === "42501") throw new MemberError("Vous n'êtes pas autorisé à retirer ce rôle.");
    throw new MemberError(error.message);
  }
}

/** Deactivate an account: stamp all its active membership rows. Cuts access via
 *  RLS immediately (the helpers ignore stamped rows). Guards against self-lockout
 *  and against deactivating the last active director. */
export async function deactivateMember(
  orgId: string,
  profileId: string,
  actorProfileId: string,
  actorIsDirection: boolean
): Promise<void> {
  if (profileId === actorProfileId) {
    throw new MemberError("Vous ne pouvez pas désactiver votre propre compte.");
  }
  await ensureManageable(orgId, profileId, actorIsDirection);
  if ((await holdsDirectionRole(orgId, profileId)) && (await countActiveDirections(orgId)) <= 1) {
    throw new MemberError("Impossible de désactiver le dernier compte de direction actif.");
  }
  const supabase = createClient();
  const { error } = await supabase
    .from("memberships")
    .update({ deactivated_at: new Date().toISOString(), deactivated_by: actorProfileId })
    .eq("org_id", orgId)
    .eq("profile_id", profileId)
    .is("deactivated_at", null);
  if (error) {
    if (error.code === "42501") throw new MemberError("Vous n'êtes pas autorisé à désactiver ce compte.");
    throw new MemberError(error.message);
  }
}

/** Reactivate an account: clear the deactivation stamp on all its rows. */
export async function reactivateMember(
  orgId: string,
  profileId: string,
  actorIsDirection: boolean
): Promise<void> {
  await ensureManageable(orgId, profileId, actorIsDirection);
  const supabase = createClient();
  const { error } = await supabase
    .from("memberships")
    .update({ deactivated_at: null, deactivated_by: null })
    .eq("org_id", orgId)
    .eq("profile_id", profileId)
    .not("deactivated_at", "is", null);
  if (error) {
    if (error.code === "42501") throw new MemberError("Vous n'êtes pas autorisé à réactiver ce compte.");
    throw new MemberError(error.message);
  }
}
