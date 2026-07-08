import "server-only";
import { createClient } from "@/lib/supabase/server";

/**
 * Admin learner data (Module 2 / S2.1 list + S2.2 sheet).
 * RLS scopes rows: direction/coordinator see all org dossiers; a coach sees
 * only their own (enrollments_read, 0003) — the list is driven by enrollments
 * so the coach scoping is automatic.
 */

export interface DossierRow {
  enrollmentId: string;
  learnerId: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  program: string | null;
  specialty: string | null;
  financer: string | null;
  status: string | null;
  progress: number | null;
  lateDays: number | null;
}

export interface DossierFilters {
  program?: string;
  specialty?: string;
  status?: string;
  financer?: string;
  late?: boolean; // only dossiers with late_days > 0
}

type RawRow = {
  id: string;
  learner_id: string;
  program: string | null;
  specialty: string | null;
  financer: string | null;
  status: string | null;
  progress: number | null;
  late_days: number | null;
  learner: { first_name: string | null; last_name: string | null; email: string } | null;
};

export async function listDossiers(orgId: string, filters: DossierFilters = {}): Promise<DossierRow[]> {
  const supabase = createClient();
  let q = supabase
    .from("enrollments_ro")
    .select("id, learner_id, program, specialty, financer, status, progress, late_days, learner:learners_ro(first_name, last_name, email)")
    .eq("org_id", orgId)
    .order("status", { ascending: true })
    .limit(1000);

  if (filters.program) q = q.eq("program", filters.program);
  if (filters.specialty) q = q.eq("specialty", filters.specialty);
  if (filters.status) q = q.eq("status", filters.status);
  if (filters.financer) q = q.eq("financer", filters.financer);
  if (filters.late) q = q.gt("late_days", 0);

  const { data, error } = await q;
  if (error) throw new Error(`Failed to load dossiers: ${error.message}`);
  return ((data ?? []) as unknown as RawRow[]).map((r) => ({
    enrollmentId: r.id,
    learnerId: r.learner_id,
    firstName: r.learner?.first_name ?? null,
    lastName: r.learner?.last_name ?? null,
    email: r.learner?.email ?? "",
    program: r.program,
    specialty: r.specialty,
    financer: r.financer,
    status: r.status,
    progress: r.progress,
    lateDays: r.late_days,
  }));
}

/** Distinct values for the list filters (from the rows the user may see). */
export async function dossierFilterOptions(orgId: string): Promise<{
  programs: string[];
  statuses: string[];
  financers: string[];
}> {
  const supabase = createClient();
  const { data } = await supabase
    .from("enrollments_ro")
    .select("program, status, financer")
    .eq("org_id", orgId)
    .limit(2000);
  const uniq = (xs: (string | null)[]) => [...new Set(xs.filter(Boolean) as string[])].sort();
  return {
    programs: uniq((data ?? []).map((r) => r.program)),
    statuses: uniq((data ?? []).map((r) => r.status)),
    financers: uniq((data ?? []).map((r) => r.financer)),
  };
}

export interface LearnerSheet {
  learner: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    email: string;
    phone: string | null;
    city: string | null;
    trainee_type: string | null;
  };
  enrollments: Record<string, unknown>[];
}

/** Full 360 sheet for one learner: identity + all their enrollments. */
export async function getLearnerSheet(orgId: string, learnerId: string): Promise<LearnerSheet | null> {
  const supabase = createClient();
  const { data: learner, error: le } = await supabase
    .from("learners_ro")
    .select("id, first_name, last_name, email, phone, city, trainee_type")
    .eq("org_id", orgId)
    .eq("id", learnerId)
    .maybeSingle();
  if (le) throw new Error(`Failed to load learner: ${le.message}`);
  if (!learner) return null;

  const { data: enrollments, error: ee } = await supabase
    .from("enrollments_ro")
    .select(
      "id, program, specialty, financer, status, start_date, access_end_date, coach_email, site, progress, late_days, projects_validated, projects_required, global_grade, certification, certification_exam_date, jury_result, insertion_situation, insertion_role, insertion_contract, insertion_company, satisfaction_score, nps, attestation_entry_sent, attestation_end_sent, convention_signed"
    )
    .eq("org_id", orgId)
    .eq("learner_id", learnerId)
    .order("start_date", { ascending: false });
  if (ee) throw new Error(`Failed to load enrollments: ${ee.message}`);

  return { learner: learner as LearnerSheet["learner"], enrollments: (enrollments ?? []) as Record<string, unknown>[] };
}
