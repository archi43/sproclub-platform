import "server-only";
import { createClient } from "@/lib/supabase/server";

/**
 * Portail jury — accès aux données sous RLS (INC-28).
 *
 * La couche ne filtre pas par évaluateur pour se protéger : c'est la RLS de
 * `0029` qui borne tout à ses affectations (`is_evaluator_of_reservation`).
 * Écrire le filtre ici en plus donnerait l'illusion d'une sécurité applicative
 * et masquerait une régression de policy — les tests d'intégration prouvent
 * l'isolation au niveau base, pas au niveau de ce fichier.
 */

export class JuryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "JuryError";
  }
}

type LearnerEmbed = { first_name: string | null; last_name: string | null; email: string } | null;
const fullName = (l: LearnerEmbed) =>
  [l?.first_name, l?.last_name].filter(Boolean).join(" ") || (l?.email ?? "—");

export interface JuryDefense {
  reservationId: string;
  enrollmentId: string;
  learnerName: string;
  program: string | null;
  specialty: string | null;
  projectNumber: number | null;
  startsAt: string;
  status: string;
  /** Appréciation déjà déposée par l'évaluateur courant, s'il y en a une. */
  ownReport: { id: string; grade: number | null; body: string } | null;
}

/** Les soutenances où l'évaluateur courant siège, la plus proche d'abord. */
export async function listMyDefenses(orgId: string, evaluatorId: string): Promise<JuryDefense[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("reservations")
    .select(
      `id, enrollment_id, project_number, starts_at, status,
       enrollment:enrollments_ro(program, specialty),
       learner:learners_ro(first_name, last_name, email)`
    )
    .eq("org_id", orgId)
    .eq("kind", "defense")
    .order("starts_at", { ascending: false });
  if (error) throw new JuryError(`Impossible de charger vos soutenances : ${error.message}`);

  type Raw = {
    id: string; enrollment_id: string; project_number: number | null; starts_at: string; status: string;
    enrollment: { program: string | null; specialty: string | null } | null; learner: LearnerEmbed;
  };
  const rows = (data ?? []) as unknown as Raw[];
  if (rows.length === 0) return [];

  // Les appréciations de l'évaluateur courant. La RLS ne lui montre que les
  // siennes : deux membres d'un même jury ne se lisent pas l'un l'autre, pour
  // que leurs avis restent indépendants.
  const { data: reports, error: re } = await supabase
    .from("coaching_reports")
    .select("id, reservation_id, grade, body")
    .eq("org_id", orgId)
    .eq("author_id", evaluatorId)
    .in("reservation_id", rows.map((r) => r.id));
  if (re) throw new JuryError(`Impossible de charger vos appréciations : ${re.message}`);

  const byReservation = new Map(
    ((reports ?? []) as { id: string; reservation_id: string; grade: number | null; body: string }[])
      .map((r) => [r.reservation_id, { id: r.id, grade: r.grade, body: r.body }])
  );

  return rows.map((r) => ({
    reservationId: r.id,
    enrollmentId: r.enrollment_id,
    learnerName: fullName(r.learner),
    program: r.enrollment?.program ?? null,
    specialty: r.enrollment?.specialty ?? null,
    projectNumber: r.project_number,
    startsAt: r.starts_at,
    status: r.status,
    ownReport: byReservation.get(r.id) ?? null,
  }));
}

export interface JuryEvaluation {
  reservationId: string;
  enrollmentId: string;
  grade: number;
  body: string;
  sessionDate: string;
}

/**
 * Dépose ou corrige l'appréciation de l'évaluateur courant.
 *
 * `upsert` sur (réservation, auteur) : l'index unique de `0029` garantit qu'un
 * évaluateur n'a qu'une note par soutenance, donc un second envoi corrige au
 * lieu d'ajouter. Un double clic ne peut pas fausser une moyenne.
 */
export async function saveMyEvaluation(orgId: string, input: JuryEvaluation, evaluatorId: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("coaching_reports")
    .upsert(
      {
        org_id: orgId,
        enrollment_id: input.enrollmentId,
        reservation_id: input.reservationId,
        author_id: evaluatorId,
        session_date: input.sessionDate,
        body: input.body,
        grade: input.grade,
        source: "platform",
      },
      { onConflict: "reservation_id,author_id" }
    );
  if (error) {
    // 42501 = violation de policy : l'évaluateur n'est pas affecté à cette
    // soutenance. Message métier, jamais le détail SQL.
    if (error.code === "42501") throw new JuryError("Vous n'êtes pas membre du jury de cette soutenance.");
    throw new JuryError(error.message);
  }
}
