import "server-only";
import { createClient } from "@/lib/supabase/server";
import { MemberError } from "@/lib/data/members";

/**
 * Evaluator pool (vivier) administration (INC-10), RLS-enforced.
 *
 * The pool is what feeds jury assignment (0004): a defense evaluator must belong
 * to the program's pool. Reads and writes go through the request-scoped client;
 * `evaluator_pool_manage` (0004) restricts writes to direction / coordinator.
 * `evaluator_pool.program` is free text (the program's name), matching the
 * booking invariant that joins on it.
 */

export interface PoolEntry {
  program: string;
  evaluatorId: string;
  email: string;
  fullName: string | null;
}

export interface EvaluatorCandidate {
  profileId: string;
  email: string;
  fullName: string | null;
}

type EmbedProfile = { email: string; full_name: string | null } | null;

/** Whole pool for the org, ordered by program then evaluator e-mail. */
export async function listEvaluatorPool(orgId: string): Promise<PoolEntry[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("evaluator_pool")
    .select("program, evaluator_id, profile:profiles(email, full_name)")
    .eq("org_id", orgId);
  if (error) throw new Error(`Failed to load evaluator pool: ${error.message}`);

  return ((data ?? []) as unknown as { program: string; evaluator_id: string; profile: EmbedProfile }[])
    .map((e) => ({
      program: e.program,
      evaluatorId: e.evaluator_id,
      email: e.profile?.email ?? "",
      fullName: e.profile?.full_name ?? null,
    }))
    .sort((a, b) => a.program.localeCompare(b.program) || a.email.localeCompare(b.email));
}

/** Members holding the active `evaluator` role — the only people who should be
 *  added to a pool. Keeps the vivier coherent at the UI level (the DB stays
 *  permissive so existing service-role seeding is unaffected). */
export async function listEvaluatorCandidates(orgId: string): Promise<EvaluatorCandidate[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("memberships")
    .select("profile_id, profile:profiles(email, full_name)")
    .eq("org_id", orgId)
    .eq("role", "evaluator")
    .is("deactivated_at", null);
  if (error) throw new Error(`Failed to load evaluators: ${error.message}`);

  return ((data ?? []) as unknown as { profile_id: string; profile: EmbedProfile }[])
    .map((e) => ({
      profileId: e.profile_id,
      email: e.profile?.email ?? "",
      fullName: e.profile?.full_name ?? null,
    }))
    .sort((a, b) => a.email.localeCompare(b.email));
}

/** Add an evaluator to a program's pool. RLS refuses non-staff writers. */
export async function addToPool(orgId: string, program: string, evaluatorId: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("evaluator_pool").insert({
    org_id: orgId,
    program,
    evaluator_id: evaluatorId,
  });
  if (error) {
    if (error.code === "23505") throw new MemberError("Cet évaluateur est déjà dans le vivier de ce programme.");
    if (error.code === "42501") throw new MemberError("Vous n'êtes pas autorisé à gérer le vivier.");
    throw new MemberError(error.message);
  }
}

/** Remove an evaluator from a program's pool. */
export async function removeFromPool(orgId: string, program: string, evaluatorId: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("evaluator_pool")
    .delete()
    .eq("org_id", orgId)
    .eq("program", program)
    .eq("evaluator_id", evaluatorId);
  if (error) {
    if (error.code === "42501") throw new MemberError("Vous n'êtes pas autorisé à gérer le vivier.");
    throw new MemberError(error.message);
  }
}
