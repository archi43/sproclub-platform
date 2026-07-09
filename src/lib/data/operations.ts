import "server-only";
import { createClient } from "@/lib/supabase/server";

/**
 * Opérations pédagogiques — the coordinator's weekly priorized task queue
 * (Module 1 / S1.1). Each list is an ACTIONABLE set, sorted by urgency, built
 * from the synced read-model (`enrollments_ro`) and the real bookings
 * (`reservations`). RLS scopes every read: direction/coordinator see the whole
 * org, a coach only their own dossiers (`enrollments_read`, 0003) — this layer
 * never widens that scope. Finished dossiers ("Terminé") are excluded, per the
 * CDC rule that the queue is about what still needs doing.
 */

/** Number of days from `access_end_date` triggering the server-freeing alert. */
export const SERVER_ALERT_DAYS = 30;
/** Stronger (red) threshold. */
export const SERVER_URGENT_DAYS = 7;

// PostgREST ANDs every top-level filter, and `.or(...)` is just one more
// predicate in that AND — so `.eq("org_id", …).or(excludeFinished)` means
// `org_id = … AND (status IS NULL OR status <> 'Terminé')`. The `.or` never
// overrides the org scope; keep org_id (and any other filter) as separate
// chained calls, not inside this string.
const excludeFinished = "status.is.null,status.neq.Terminé";
const dateOnly = (d: Date) => d.toISOString().slice(0, 10);

type LearnerEmbed = { first_name: string | null; last_name: string | null; email: string } | null;
const fullName = (l: LearnerEmbed) =>
  [l?.first_name, l?.last_name].filter(Boolean).join(" ") || (l?.email ?? "—");

export interface UpcomingDefense {
  reservationId: string;
  learnerName: string;
  learnerEmail: string;
  program: string | null;
  projectNumber: number | null;
  startsAt: string;
  status: string;
  evaluatorCount: number;
  /** A defense needs a jury of two; fewer means "assign an evaluator" is due. */
  needsJury: boolean;
}

export interface ServerToFree {
  enrollmentId: string;
  learnerId: string;
  learnerName: string;
  learnerEmail: string;
  program: string | null;
  accessEndDate: string;
  daysLeft: number;
  urgent: boolean;
}

export interface LateLearner {
  enrollmentId: string;
  learnerId: string;
  learnerName: string;
  learnerEmail: string;
  program: string | null;
  status: string | null;
  lateDays: number;
}

export interface PendingReport {
  enrollmentId: string;
  learnerId: string;
  learnerName: string;
  learnerEmail: string;
  program: string | null;
  pendingReports: number;
}

/** Upcoming defenses (future, not cancelled/declined), soonest first, flagged
 *  when their jury of two is not yet complete. */
export async function getUpcomingDefenses(orgId: string, program?: string): Promise<UpcomingDefense[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("reservations")
    .select(
      `id, project_number, starts_at, status,
       enrollment:enrollments_ro(program),
       learner:learners_ro(first_name, last_name, email),
       evaluators:reservation_evaluators(evaluator_id)`
    )
    .eq("org_id", orgId)
    .eq("kind", "defense")
    .gte("starts_at", new Date().toISOString())
    .in("status", ["pending", "confirmed"])
    .order("starts_at", { ascending: true });
  if (error) throw new Error(`Failed to load upcoming defenses: ${error.message}`);

  type Raw = {
    id: string;
    project_number: number | null;
    starts_at: string;
    status: string;
    enrollment: { program: string | null } | null;
    learner: LearnerEmbed;
    evaluators: { evaluator_id: string }[] | null;
  };
  return ((data ?? []) as unknown as Raw[])
    .filter((r) => !program || r.enrollment?.program === program)
    .map((r) => {
      const evaluatorCount = r.evaluators?.length ?? 0;
      return {
        reservationId: r.id,
        learnerName: fullName(r.learner),
        learnerEmail: r.learner?.email ?? "",
        program: r.enrollment?.program ?? null,
        projectNumber: r.project_number,
        startsAt: r.starts_at,
        status: r.status,
        evaluatorCount,
        needsJury: evaluatorCount < 2,
      };
    });
}

/** Server accesses ending within SERVER_ALERT_DAYS (active dossiers only),
 *  soonest first. `urgent` marks the ≤ SERVER_URGENT_DAYS window. */
export async function getServersToFree(orgId: string, program?: string): Promise<ServerToFree[]> {
  const supabase = createClient();
  const today = new Date();
  const horizon = new Date(today.getTime() + SERVER_ALERT_DAYS * 86_400_000);
  let q = supabase
    .from("enrollments_ro")
    .select("id, learner_id, program, access_end_date, learner:learners_ro(first_name, last_name, email)")
    .eq("org_id", orgId)
    .gte("access_end_date", dateOnly(today))
    .lte("access_end_date", dateOnly(horizon))
    .or(excludeFinished)
    .order("access_end_date", { ascending: true });
  if (program) q = q.eq("program", program);
  const { data, error } = await q;
  if (error) throw new Error(`Failed to load server accesses: ${error.message}`);

  type Raw = { id: string; learner_id: string; program: string | null; access_end_date: string; learner: LearnerEmbed };
  const start = Date.parse(dateOnly(today));
  return ((data ?? []) as unknown as Raw[]).map((r) => {
    const daysLeft = Math.round((Date.parse(r.access_end_date) - start) / 86_400_000);
    return {
      enrollmentId: r.id,
      learnerId: r.learner_id,
      learnerName: fullName(r.learner),
      learnerEmail: r.learner?.email ?? "",
      program: r.program,
      accessEndDate: r.access_end_date,
      daysLeft,
      urgent: daysLeft <= SERVER_URGENT_DAYS,
    };
  });
}

/** Active dossiers with a real delay, most-late first. */
export async function getLateLearners(orgId: string, program?: string): Promise<LateLearner[]> {
  const supabase = createClient();
  let q = supabase
    .from("enrollments_ro")
    .select("id, learner_id, program, status, late_days, learner:learners_ro(first_name, last_name, email)")
    .eq("org_id", orgId)
    .gt("late_days", 0)
    .or(excludeFinished)
    .order("late_days", { ascending: false })
    .limit(100);
  if (program) q = q.eq("program", program);
  const { data, error } = await q;
  if (error) throw new Error(`Failed to load late learners: ${error.message}`);

  type Raw = { id: string; learner_id: string; program: string | null; status: string | null; late_days: number; learner: LearnerEmbed };
  return ((data ?? []) as unknown as Raw[]).map((r) => ({
    enrollmentId: r.id,
    learnerId: r.learner_id,
    learnerName: fullName(r.learner),
    learnerEmail: r.learner?.email ?? "",
    program: r.program,
    status: r.status,
    lateDays: r.late_days,
  }));
}

/** Active dossiers with evaluation reports still to be entered, most first. */
export async function getPendingReports(orgId: string, program?: string): Promise<PendingReport[]> {
  const supabase = createClient();
  let q = supabase
    .from("enrollments_ro")
    .select("id, learner_id, program, pending_reports, learner:learners_ro(first_name, last_name, email)")
    .eq("org_id", orgId)
    .gt("pending_reports", 0)
    .or(excludeFinished)
    .order("pending_reports", { ascending: false })
    .limit(100);
  if (program) q = q.eq("program", program);
  const { data, error } = await q;
  if (error) throw new Error(`Failed to load pending reports: ${error.message}`);

  type Raw = { id: string; learner_id: string; program: string | null; pending_reports: number; learner: LearnerEmbed };
  return ((data ?? []) as unknown as Raw[]).map((r) => ({
    enrollmentId: r.id,
    learnerId: r.learner_id,
    learnerName: fullName(r.learner),
    learnerEmail: r.learner?.email ?? "",
    program: r.program,
    pendingReports: r.pending_reports,
  }));
}

/** Distinct program names visible to the caller, for the queue filter. */
export async function operationsPrograms(orgId: string): Promise<string[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("enrollments_ro")
    .select("program")
    .eq("org_id", orgId)
    .or(excludeFinished)
    .limit(2000);
  return [...new Set((data ?? []).map((r) => r.program).filter(Boolean) as string[])].sort();
}
