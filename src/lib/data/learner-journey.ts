import "server-only";
import { createClient } from "@/lib/supabase/server";
import { compliancePieces, type ComplianceRow } from "@/lib/compliance-rules";
import {
  buildJourneyAlerts,
  LEARNER_ACTIONABLE_PIECES,
  type JourneyAlert,
  type UpcomingEvent,
} from "@/lib/journey-rules";

/**
 * Écran « Mon parcours » (P.A1) — vue synthétique du dossier de l'apprenant.
 *
 * Le CDC demande quatre zones : en-tête (programme, spécialité, dates clés),
 * progression (avancement, projets validés, complétion 360L), prochaines
 * échéances, et prochain rendez-vous à confirmer — plus la mise en avant des
 * échéances proches et des documents manquants.
 *
 * RLS : `enrollments_ro`, `reservations` et `project_deliverables` ne renvoient
 * que les lignes de l'appelant. Aucun filtre applicatif ne s'y substitue.
 */

export interface JourneyDeliverable {
  projectNumber: number;
  submitted: boolean;
  submittedAt: string | null;
  validatedAt: string | null;
  score: number | null;
}

export interface JourneyEvent {
  id: string;
  kind: "coaching" | "defense";
  startsAt: string;
  endsAt: string;
  status: string | null;
  projectNumber: number | null;
}

export interface Journey {
  enrollmentId: string;
  program: string | null;
  specialty: string | null;
  status: string | null;
  startDate: string | null;
  endDate: string | null;
  accessEndDate: string | null;
  coachEmail: string | null;
  progress: number | null;
  lateDays: number | null;
  projectsValidated: number | null;
  projectsRequired: number | null;
  deliverables: JourneyDeliverable[];
  upcoming: JourneyEvent[];
  alerts: JourneyAlert[];
}

type RawEnrollment = {
  id: string;
  program: string | null;
  specialty: string | null;
  status: string | null;
  start_date: string | null;
  end_date: string | null;
  access_end_date: string | null;
  coach_email: string | null;
  progress: number | null;
  late_days: number | null;
  projects_validated: number | null;
  projects_required: number | null;
  global_grade: number | null;
  certification: string | null;
  insertion_situation: string | null;
  satisfaction_score: number | null;
  nps: number | null;
  attestation_entry_sent: boolean | null;
  convention_signed: boolean | null;
  pending_reports: number | null;
};

/** Les pièces manquantes dont l'apprenant est l'acteur (convention, questionnaires). */
function learnerMissingPieces(row: ComplianceRow): string[] {
  const actionable = new Set<string>(LEARNER_ACTIONABLE_PIECES);
  return compliancePieces(row)
    .filter((p) => actionable.has(p.key) && !p.present)
    .map((p) => p.label);
}

export async function getMyJourney(orgId: string, now: Date = new Date()): Promise<Journey[]> {
  const supabase = createClient();

  const { data: rows, error } = await supabase
    .from("enrollments_ro")
    .select(
      "id, program, specialty, status, start_date, end_date, access_end_date, coach_email, progress, " +
        "late_days, projects_validated, projects_required, global_grade, certification, insertion_situation, " +
        "satisfaction_score, nps, attestation_entry_sent, convention_signed, pending_reports"
    )
    .eq("org_id", orgId)
    .order("start_date", { ascending: false });
  if (error) throw new Error(`Chargement du parcours impossible : ${error.message}`);

  const enrollments = (rows ?? []) as unknown as RawEnrollment[];
  if (enrollments.length === 0) return [];

  const ids = enrollments.map((e) => e.id);
  const nowIso = now.toISOString();

  const [deliverablesRes, reservationsRes] = await Promise.all([
    supabase
      .from("project_deliverables")
      .select("enrollment_id, project_number, deliverable_submitted, submitted_at, validated_at, l360_score")
      .in("enrollment_id", ids)
      .order("project_number", { ascending: true }),
    supabase
      .from("reservations")
      .select("id, enrollment_id, kind, starts_at, ends_at, status, project_number")
      .in("enrollment_id", ids)
      .gte("ends_at", nowIso)
      .neq("status", "cancelled")
      .order("starts_at", { ascending: true }),
  ]);
  if (deliverablesRes.error) throw new Error(`Chargement des livrables impossible : ${deliverablesRes.error.message}`);
  if (reservationsRes.error) throw new Error(`Chargement des rendez-vous impossible : ${reservationsRes.error.message}`);

  return enrollments.map((e) => {
    const deliverables: JourneyDeliverable[] = (deliverablesRes.data ?? [])
      .filter((d) => d.enrollment_id === e.id)
      .map((d) => ({
        projectNumber: d.project_number as number,
        submitted: d.deliverable_submitted === true,
        submittedAt: (d.submitted_at as string | null) ?? null,
        validatedAt: (d.validated_at as string | null) ?? null,
        score: (d.l360_score as number | null) ?? null,
      }));

    const upcoming: JourneyEvent[] = (reservationsRes.data ?? [])
      .filter((r) => r.enrollment_id === e.id)
      .map((r) => ({
        id: r.id as string,
        kind: r.kind as "coaching" | "defense",
        startsAt: r.starts_at as string,
        endsAt: r.ends_at as string,
        status: (r.status as string | null) ?? null,
        projectNumber: (r.project_number as number | null) ?? null,
      }));

    const next: UpcomingEvent | null = upcoming[0]
      ? { kind: upcoming[0].kind, startsAt: upcoming[0].startsAt, status: upcoming[0].status }
      : null;

    return {
      enrollmentId: e.id,
      program: e.program,
      specialty: e.specialty,
      status: e.status,
      startDate: e.start_date,
      endDate: e.end_date,
      accessEndDate: e.access_end_date,
      coachEmail: e.coach_email,
      progress: e.progress,
      lateDays: e.late_days,
      projectsValidated: e.projects_validated,
      projectsRequired: e.projects_required,
      deliverables,
      upcoming,
      alerts: buildJourneyAlerts({
        status: e.status,
        accessEndDate: e.access_end_date,
        endDate: e.end_date,
        next,
        missingPieces: learnerMissingPieces(e),
        now,
      }),
    };
  });
}
