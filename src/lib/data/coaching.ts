import "server-only";
import { createClient } from "@/lib/supabase/server";

/**
 * Coach portal data-access (INC-4, Étape 3). Every read runs through the
 * request-scoped client; the tightened RLS from 0014 restricts a coach to their
 * OWN dossiers (learners, reservations, deliverables, coaching reports), so this
 * layer never has to re-filter — it just relies on RLS being the guard.
 */

export class CoachError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CoachError";
  }
}

type LearnerEmbed = { first_name: string | null; last_name: string | null; email: string } | null;
const fullName = (l: LearnerEmbed) =>
  [l?.first_name, l?.last_name].filter(Boolean).join(" ") || (l?.email ?? "—");

export interface CoachLearner {
  enrollmentId: string;
  learnerId: string;
  name: string;
  email: string;
  program: string | null;
  status: string | null;
  progress: number | null;
  lateDays: number | null;
}

/** The coach's own dossiers (RLS-scoped by coach_email). */
export async function listMyLearners(orgId: string): Promise<CoachLearner[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("enrollments_ro")
    .select("id, learner_id, program, status, progress, late_days, learner:learners_ro(first_name, last_name, email)")
    .eq("org_id", orgId)
    .order("late_days", { ascending: false, nullsFirst: false });
  if (error) throw new Error(`Failed to load coach learners: ${error.message}`);

  type Raw = { id: string; learner_id: string; program: string | null; status: string | null; progress: number | null; late_days: number | null; learner: LearnerEmbed };
  return ((data ?? []) as unknown as Raw[]).map((r) => ({
    enrollmentId: r.id,
    learnerId: r.learner_id,
    name: fullName(r.learner),
    email: r.learner?.email ?? "",
    program: r.program,
    status: r.status,
    progress: r.progress,
    lateDays: r.late_days,
  }));
}

export interface CoachEnrollmentDetail {
  enrollmentId: string;
  learnerId: string;
  learnerName: string;
  learnerEmail: string;
  program: string | null;
  specialty: string | null;
  status: string | null;
  progress: number | null;
  lateDays: number | null;
  startDate: string | null;
  accessEndDate: string | null;
  projectsValidated: number | null;
  projectsRequired: number | null;
}

export interface CoachReservation {
  id: string;
  kind: string;
  projectNumber: number | null;
  startsAt: string;
  status: string;
}

export interface CoachDeliverable {
  id: string;
  projectNumber: number;
  submitted: boolean;
  url: string | null;
  submittedAt: string | null;
  validatedAt: string | null; // validation par le jury (reflet 360Learning)
}

export interface CoachingReport {
  id: string;
  sessionDate: string | null;
  body: string;
  grade: number | null;
  createdAt: string;
}

export interface CoachDossier {
  enrollment: CoachEnrollmentDetail;
  reservations: CoachReservation[];
  deliverables: CoachDeliverable[];
  reports: CoachingReport[];
}

/** Full dossier for ONE of the coach's learners. Returns null if the enrollment
 *  is not theirs (RLS returns no row). */
export async function getCoachDossier(orgId: string, enrollmentId: string): Promise<CoachDossier | null> {
  const supabase = createClient();
  const { data: e, error } = await supabase
    .from("enrollments_ro")
    .select("id, learner_id, program, specialty, status, progress, late_days, start_date, access_end_date, projects_validated, projects_required, learner:learners_ro(first_name, last_name, email)")
    .eq("org_id", orgId)
    .eq("id", enrollmentId)
    .maybeSingle();
  if (error) throw new Error(`Failed to load dossier: ${error.message}`);
  if (!e) return null;

  const row = e as unknown as {
    id: string; learner_id: string; program: string | null; specialty: string | null; status: string | null;
    progress: number | null; late_days: number | null; start_date: string | null; access_end_date: string | null;
    projects_validated: number | null; projects_required: number | null; learner: LearnerEmbed;
  };

  const [resv, deliv, reps] = await Promise.all([
    supabase.from("reservations")
      .select("id, kind, project_number, starts_at, status")
      .eq("org_id", orgId).eq("enrollment_id", enrollmentId)
      .order("starts_at", { ascending: false }),
    supabase.from("project_deliverables")
      .select("id, project_number, deliverable_submitted, deliverable_url, submitted_at, validated_at")
      .eq("org_id", orgId).eq("enrollment_id", enrollmentId)
      .order("project_number", { ascending: true }),
    supabase.from("coaching_reports")
      .select("id, session_date, body, grade, created_at")
      .eq("org_id", orgId).eq("enrollment_id", enrollmentId)
      .order("created_at", { ascending: false }),
  ]);
  if (resv.error) throw new Error(`Failed to load reservations: ${resv.error.message}`);
  if (deliv.error) throw new Error(`Failed to load deliverables: ${deliv.error.message}`);
  if (reps.error) throw new Error(`Failed to load reports: ${reps.error.message}`);

  return {
    enrollment: {
      enrollmentId: row.id,
      learnerId: row.learner_id,
      learnerName: fullName(row.learner),
      learnerEmail: row.learner?.email ?? "",
      program: row.program,
      specialty: row.specialty,
      status: row.status,
      progress: row.progress,
      lateDays: row.late_days,
      startDate: row.start_date,
      accessEndDate: row.access_end_date,
      projectsValidated: row.projects_validated,
      projectsRequired: row.projects_required,
    },
    reservations: (resv.data ?? []).map((r) => ({
      id: r.id as string, kind: r.kind as string, projectNumber: r.project_number as number | null,
      startsAt: r.starts_at as string, status: r.status as string,
    })),
    deliverables: (deliv.data ?? []).map((d) => ({
      id: d.id as string, projectNumber: d.project_number as number, submitted: d.deliverable_submitted as boolean,
      url: d.deliverable_url as string | null, submittedAt: d.submitted_at as string | null,
      validatedAt: d.validated_at as string | null,
    })),
    reports: (reps.data ?? []).map((r) => ({
      id: r.id as string, sessionDate: r.session_date as string | null, body: r.body as string,
      grade: r.grade as number | null, createdAt: r.created_at as string,
    })),
  };
}

export interface NewReport {
  enrollmentId: string;
  reservationId?: string | null;
  sessionDate?: string | null;
  body: string;
  grade?: number | null;
}

/** Create a coaching report. RLS enforces that the enrollment is the coach's and
 *  that author_id is the caller. */
export async function createReport(orgId: string, input: NewReport, authorId: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("coaching_reports").insert({
    org_id: orgId,
    enrollment_id: input.enrollmentId,
    reservation_id: input.reservationId ?? null,
    author_id: authorId,
    session_date: input.sessionDate || null,
    body: input.body,
    grade: input.grade ?? null,
  });
  if (error) {
    if (error.code === "42501") throw new CoachError("Ce dossier n'est pas dans votre portefeuille.");
    throw new CoachError(error.message);
  }
}

/** Coaching reports for a learner's dossiers — used by the admin sheet (staff
 *  read via RLS). Returns [] for a non-staff caller. */
export async function listReportsForLearner(orgId: string, learnerId: string): Promise<(CoachingReport & { enrollmentId: string })[]> {
  const supabase = createClient();
  const { data: enrollments } = await supabase
    .from("enrollments_ro")
    .select("id")
    .eq("org_id", orgId)
    .eq("learner_id", learnerId);
  const ids = (enrollments ?? []).map((e) => e.id as string);
  if (ids.length === 0) return [];

  const { data, error } = await supabase
    .from("coaching_reports")
    .select("id, enrollment_id, session_date, body, grade, created_at")
    .eq("org_id", orgId)
    .in("enrollment_id", ids)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Failed to load reports: ${error.message}`);
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: r.id as string,
    enrollmentId: r.enrollment_id as string,
    sessionDate: r.session_date as string | null,
    body: r.body as string,
    grade: r.grade as number | null,
    createdAt: r.created_at as string,
  }));
}
