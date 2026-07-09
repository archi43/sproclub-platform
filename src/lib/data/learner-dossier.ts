import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";

/**
 * Student "Mon dossier" (P.A2). Everything here is read through the request
 * client, so RLS is the guard: the enrollments_read (0003) student branch and
 * the learner-docs storage policies (0015) restrict a student to their OWN
 * dossier and documents. This layer never widens that scope.
 */

const BUCKET = "learner-docs";

export interface MyDossier {
  enrollmentId: string;
  learnerName: string;
  program: string | null;
  specialty: string | null;
  status: string | null;
  progress: number | null;
  projectsValidated: number | null;
  projectsRequired: number | null;
  globalGrade: number | null;
  certification: string | null;
  certificationExamDate: string | null;
  juryResult: string | null;
  insertionSituation: string | null;
  insertionRole: string | null;
  insertionCompany: string | null;
  satisfactionScore: number | null;
  nps: number | null;
}

type Raw = {
  id: string;
  program: string | null;
  specialty: string | null;
  status: string | null;
  progress: number | null;
  projects_validated: number | null;
  projects_required: number | null;
  global_grade: number | null;
  certification: string | null;
  certification_exam_date: string | null;
  jury_result: string | null;
  insertion_situation: string | null;
  insertion_role: string | null;
  insertion_company: string | null;
  satisfaction_score: number | null;
  nps: number | null;
  learner: { first_name: string | null; last_name: string | null; email: string } | null;
};

/** The signed-in student's own dossier(s) — RLS returns only theirs. */
export async function getMyDossiers(orgId: string): Promise<MyDossier[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("enrollments_ro")
    .select(
      "id, program, specialty, status, progress, projects_validated, projects_required, global_grade, " +
        "certification, certification_exam_date, jury_result, insertion_situation, insertion_role, " +
        "insertion_company, satisfaction_score, nps, learner:learners_ro(first_name, last_name, email)"
    )
    .eq("org_id", orgId)
    .order("start_date", { ascending: false });
  if (error) throw new Error(`Failed to load dossier: ${error.message}`);

  return ((data ?? []) as unknown as Raw[]).map((r) => ({
    enrollmentId: r.id,
    learnerName: [r.learner?.first_name, r.learner?.last_name].filter(Boolean).join(" ") || (r.learner?.email ?? "—"),
    program: r.program,
    specialty: r.specialty,
    status: r.status,
    progress: r.progress,
    projectsValidated: r.projects_validated,
    projectsRequired: r.projects_required,
    globalGrade: r.global_grade,
    certification: r.certification,
    certificationExamDate: r.certification_exam_date,
    juryResult: r.jury_result,
    insertionSituation: r.insertion_situation,
    insertionRole: r.insertion_role,
    insertionCompany: r.insertion_company,
    satisfactionScore: r.satisfaction_score,
    nps: r.nps,
  }));
}

export interface LearnerDocument {
  name: string;
  url: string | null;
}

/** The signed-in student's documents from the isolated Storage folder
 *  {org}/{their e-mail}/…, with short-lived signed download URLs. The e-mail is
 *  resolved from the session (never a caller-supplied value) so the folder can
 *  only ever be the caller's own; Storage RLS (0015) is the authoritative guard. */
export async function listMyDocuments(orgId: string): Promise<LearnerDocument[]> {
  const user = await getCurrentUser();
  if (!user?.email) return [];
  const supabase = createClient();
  const prefix = `${orgId}/${user.email.toLowerCase()}`;
  const { data, error } = await supabase.storage.from(BUCKET).list(prefix, { limit: 100, sortBy: { column: "name", order: "asc" } });
  if (error) throw new Error(`Failed to list documents: ${error.message}`);

  const files = (data ?? []).filter((f) => f.id !== null); // skip pseudo-folders
  const out: LearnerDocument[] = [];
  for (const f of files) {
    const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrl(`${prefix}/${f.name}`, 300);
    out.push({ name: f.name, url: signed?.signedUrl ?? null });
  }
  return out;
}
