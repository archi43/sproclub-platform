import "server-only";
import { adminClient } from "@/lib/supabase/admin";
import { MemberError } from "@/lib/data/members";
import type { AppRole } from "@/lib/types";

/**
 * Account provisioning (INC-10) — the one part of user management RLS cannot do,
 * because only the service role may create an auth user. MUST be called behind a
 * route/role guard (direction / coordinator); the caller's authority is checked
 * upstream, not here.
 *
 * Invite = find-or-create the auth user, ensure it carries the org claim
 * (`app_metadata.org_id`, which `current_org_id()` reads under PostgREST
 * pooling), mirror it into `profiles`, then grant the membership. The person then
 * signs in through the normal e-mail magic-link flow — no password is set.
 * Idempotent on the profile; the membership insert reports an existing role.
 */

export interface InviteInput {
  orgId: string;
  email: string;
  fullName?: string | null;
  role: AppRole;
  invitedBy: string;
}

export interface InviteResult {
  profileId: string;
  /** True if a new auth account was created (vs. an existing person re-used). */
  created: boolean;
}

export async function inviteMember(input: InviteInput): Promise<InviteResult> {
  const admin = adminClient();
  const email = input.email.trim().toLowerCase();
  if (!email || !email.includes("@")) {
    throw new MemberError("Adresse e-mail invalide.");
  }

  // 1) Resolve the person. profiles mirrors auth.users 1:1, so an existing
  //    profile means the account already exists (possibly from another role or
  //    a synced learner). Re-use it rather than creating a duplicate.
  const { data: existing, error: lookupErr } = await admin
    .from("profiles")
    .select("id")
    .eq("email", email)
    .maybeSingle();
  if (lookupErr) throw new MemberError(lookupErr.message);

  let profileId: string;
  let created = false;

  if (existing) {
    profileId = existing.id as string;
    // Ensure the org claim is present for RLS. SINGLE-ORG LAUNCH assumption:
    // profiles are global, so before opening the platform to other organisms
    // (Étape 7) this must NOT silently overwrite the org claim of a person who
    // already belongs to a different organism — gate it on "already a member of
    // this org" or mint a distinct identity. Harmless while there is one org.
    const { error: claimErr } = await admin.auth.admin.updateUserById(profileId, {
      app_metadata: { org_id: input.orgId },
    });
    if (claimErr) throw new MemberError(claimErr.message);
    if (input.fullName) {
      await admin.from("profiles").update({ full_name: input.fullName }).eq("id", profileId);
    }
  } else {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      email_confirm: true, // no password; they log in via the e-mail link flow
      app_metadata: { org_id: input.orgId },
    });
    if (error || !data?.user) {
      const msg = error?.message ?? "";
      if (/already.*registered|exists/i.test(msg)) {
        throw new MemberError("Un compte existe déjà pour cet e-mail.");
      }
      throw new MemberError(msg || "Création du compte impossible.");
    }
    profileId = data.user.id;
    created = true;
    const { error: profErr } = await admin
      .from("profiles")
      .insert({ id: profileId, email, full_name: input.fullName ?? null });
    if (profErr) {
      // Compensate: the orphan auth user would otherwise block a retry.
      await admin.auth.admin.deleteUser(profileId);
      throw new MemberError(profErr.message);
    }
  }

  // 2) Grant the membership (audit: invited_by).
  const { error: memErr } = await admin.from("memberships").insert({
    org_id: input.orgId,
    profile_id: profileId,
    role: input.role,
    invited_by: input.invitedBy,
  });
  if (memErr) {
    if (memErr.code === "23505") {
      throw new MemberError("Cette personne a déjà ce rôle dans l'organisme.");
    }
    // A freshly created auth user with no membership is unusable; roll it back.
    if (created) {
      await admin.from("profiles").delete().eq("id", profileId);
      await admin.auth.admin.deleteUser(profileId);
    }
    throw new MemberError(memErr.message);
  }

  return { profileId, created };
}
