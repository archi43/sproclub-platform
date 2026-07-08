import "server-only";
import { createClient } from "@/lib/supabase/server";

/**
 * Coordination (staff) data-access: defenses and their juries.
 * RLS restricts these reads to direction/coordinator of the org (0004/0006);
 * this layer never widens that scope.
 */

export interface JuryEvaluator {
  evaluatorId: string;
  email: string;
  name: string | null;
}

export interface DefenseRow {
  id: string;
  projectNumber: number | null;
  startsAt: string;
  status: string;
  program: string | null;
  coachEmail: string | null;
  learnerName: string;
  learnerEmail: string;
  evaluators: JuryEvaluator[];
}

/* Loose shapes for the PostgREST embeds (no generated types in the pilot). */
type EmbedProfile = { email: string; full_name: string | null } | null;
type RawDefense = {
  id: string;
  project_number: number | null;
  starts_at: string;
  status: string;
  enrollment: { program: string | null; coach_email: string | null } | null;
  learner: { first_name: string | null; last_name: string | null; email: string } | null;
  evaluators: { evaluator_id: string; profile: EmbedProfile }[] | null;
};

export async function getDefenses(orgId: string): Promise<DefenseRow[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("reservations")
    .select(
      `id, project_number, starts_at, status,
       enrollment:enrollments_ro(program, coach_email),
       learner:learners_ro(first_name, last_name, email),
       evaluators:reservation_evaluators(evaluator_id, profile:profiles(email, full_name))`
    )
    .eq("org_id", orgId)
    .eq("kind", "defense")
    .order("starts_at", { ascending: true });
  if (error) throw new Error(`Failed to load defenses: ${error.message}`);

  return ((data ?? []) as unknown as RawDefense[]).map((r) => ({
    id: r.id,
    projectNumber: r.project_number,
    startsAt: r.starts_at,
    status: r.status,
    program: r.enrollment?.program ?? null,
    coachEmail: r.enrollment?.coach_email ?? null,
    learnerName: [r.learner?.first_name, r.learner?.last_name].filter(Boolean).join(" ") || (r.learner?.email ?? "—"),
    learnerEmail: r.learner?.email ?? "",
    evaluators: (r.evaluators ?? []).map((e) => ({
      evaluatorId: e.evaluator_id,
      email: e.profile?.email ?? "",
      name: e.profile?.full_name ?? null,
    })),
  }));
}

/** Evaluator pool for a program (candidates for a jury), excluding no one here. */
export async function getPoolEvaluators(orgId: string, program: string): Promise<JuryEvaluator[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("evaluator_pool")
    .select("evaluator_id, profile:profiles(email, full_name)")
    .eq("org_id", orgId)
    .eq("program", program);
  if (error) throw new Error(`Failed to load evaluator pool: ${error.message}`);

  return ((data ?? []) as unknown as { evaluator_id: string; profile: EmbedProfile }[]).map((e) => ({
    evaluatorId: e.evaluator_id,
    email: e.profile?.email ?? "",
    name: e.profile?.full_name ?? null,
  }));
}
