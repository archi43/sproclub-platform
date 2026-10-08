/**
 * Accès aux ressources (INC-30) — règles **pures**, sans base ni horloge.
 *
 * Deux décisions vivent ici, toutes deux prouvées hors DB :
 *
 * 1. Quelles affectations du back office deviennent des lignes de
 *    `resource_assignments` (`planResourceAssignments`). Rien ne doit disparaître
 *    en silence : chaque affectation écartée l'est avec un motif compté.
 * 2. Quand un apprenant peut voir le mot de passe (`canRevealPassword`) : pendant
 *    la période de validité de l'affectation, bornes incluses, jamais avant ni
 *    après. Un accès expiré n'a plus de raison d'exposer un secret encore valable
 *    pour l'apprenant suivant sur le même compte.
 *
 * Les dates sont des chaînes ISO `YYYY-MM-DD` : la comparaison lexicale suffit et
 * évite tout fuseau horaire. « Aujourd'hui » est toujours passé par l'appelant.
 */

/** Une affectation expirée reste synchronisée (et visible, sans mot de passe)
 *  pendant ce nombre de jours, pour que l'apprenant comprenne pourquoi son accès
 *  ne fonctionne plus. Au-delà, l'historique reste dans le back office. */
export const RESOURCE_SYNC_LOOKBACK_DAYS = 30;

export type AssignmentStatus = "upcoming" | "active" | "expired";

export interface SourceAssignment {
  recordId: string;
  commandeId: string | null;
  resourceIds: string[];
  startsOn: string | null;
  endsOn: string | null;
}

export interface SourceResource {
  recordId: string;
  label: string | null;
  typeId: string | null;
}

export interface SourceResourceType {
  recordId: string;
  name: string | null;
  category: string | null;
}

export interface AssignmentRow {
  airtable_record_id: string;
  airtable_resource_id: string;
  enrollment_id: string;
  resource_label: string;
  resource_type: string | null;
  resource_category: string | null;
  starts_on: string | null;
  ends_on: string | null;
}

export type AssignmentSkipReason =
  | "no-commande"
  | "unknown-enrollment"
  | "erased"
  | "no-resource"
  | "unknown-resource";

export interface AssignmentPlan {
  rows: AssignmentRow[];
  skipped: Record<AssignmentSkipReason, number>;
}

export interface PlanInput {
  assignments: SourceAssignment[];
  resources: SourceResource[];
  types: SourceResourceType[];
  /** recordID de la Commande Airtable → id du dossier Postgres. */
  enrollmentByCommande: ReadonlyMap<string, string>;
  /** Dossiers dont l'apprenant a exercé son droit à l'effacement. */
  erasedEnrollments: ReadonlySet<string>;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Statut d'une affectation à une date donnée. Bornes incluses ; une borne
 *  absente est ouverte (pas de début = déjà commencée, pas de fin = sans fin). */
export function assignmentStatus(
  startsOn: string | null,
  endsOn: string | null,
  today: string
): AssignmentStatus {
  if (!ISO_DATE.test(today)) throw new Error(`Date du jour invalide : ${today}`);
  if (startsOn && today < startsOn) return "upcoming";
  if (endsOn && today > endsOn) return "expired";
  return "active";
}

/** Le mot de passe n'est montré que pendant la période de validité. */
export function canRevealPassword(status: AssignmentStatus): boolean {
  return status === "active";
}

/** Traduit les affectations du back office en lignes à refléter. */
export function planResourceAssignments(input: PlanInput): AssignmentPlan {
  const resources = new Map(input.resources.map((r) => [r.recordId, r]));
  const types = new Map(input.types.map((t) => [t.recordId, t]));
  const skipped: Record<AssignmentSkipReason, number> = {
    "no-commande": 0,
    "unknown-enrollment": 0,
    erased: 0,
    "no-resource": 0,
    "unknown-resource": 0,
  };
  const rows: AssignmentRow[] = [];

  for (const a of input.assignments) {
    if (!a.commandeId) { skipped["no-commande"]++; continue; }
    const enrollmentId = input.enrollmentByCommande.get(a.commandeId);
    if (!enrollmentId) { skipped["unknown-enrollment"]++; continue; }
    if (input.erasedEnrollments.has(enrollmentId)) { skipped.erased++; continue; }
    if (a.resourceIds.length === 0) { skipped["no-resource"]++; continue; }

    for (const resourceId of a.resourceIds) {
      const resource = resources.get(resourceId);
      const label = resource?.label?.trim();
      if (!resource || !label) { skipped["unknown-resource"]++; continue; }
      const type = resource.typeId ? types.get(resource.typeId) : undefined;
      rows.push({
        airtable_record_id: a.recordId,
        airtable_resource_id: resourceId,
        enrollment_id: enrollmentId,
        resource_label: label,
        resource_type: type?.name?.trim() || null,
        resource_category: type?.category?.trim() || null,
        starts_on: a.startsOn && ISO_DATE.test(a.startsOn) ? a.startsOn : null,
        ends_on: a.endsOn && ISO_DATE.test(a.endsOn) ? a.endsOn : null,
      });
    }
  }
  return { rows, skipped };
}

/** Clé d'une ligne reflétée : une affectation × un compte. */
export function assignmentKey(row: { airtable_record_id: string; airtable_resource_id: string }): string {
  return `${row.airtable_record_id}|${row.airtable_resource_id}`;
}

/**
 * Lignes existantes que la source ne porte plus (affectation supprimée, compte
 * retiré, période sortie de la fenêtre). La table étant produite entièrement
 * par la synchronisation, les retirer ne coupe jamais une saisie manuelle.
 */
export function staleAssignmentIds(
  existing: ReadonlyArray<{ id: string; airtable_record_id: string; airtable_resource_id: string }>,
  planned: ReadonlyArray<AssignmentRow>
): string[] {
  const kept = new Set(planned.map(assignmentKey));
  return existing.filter((e) => !kept.has(assignmentKey(e))).map((e) => e.id);
}

/** Ordre d'affichage : accès en cours d'abord, puis à venir, puis expirés ;
 *  à statut égal, la fin la plus proche en premier. */
export function sortForDisplay<T extends { status: AssignmentStatus; endsOn: string | null }>(items: readonly T[]): T[] {
  const rank: Record<AssignmentStatus, number> = { active: 0, upcoming: 1, expired: 2 };
  return [...items].sort((a, b) => {
    const byStatus = rank[a.status] - rank[b.status];
    if (byStatus !== 0) return byStatus;
    return (a.endsOn ?? "9999-12-31").localeCompare(b.endsOn ?? "9999-12-31");
  });
}

/**
 * Garde-fou du miroir : une lecture qui ne rend **aucune** affectation alors que
 * le reflet en porte ressemble davantage à un incident (filtre cassé, table
 * renommée, vue vidée) qu'à la fin simultanée de tous les accès. Dans ce cas on
 * ne retire rien : laisser une ligne quelques heures de trop coûte moins que
 * couper d'un coup les accès de toute une promotion.
 */
export function shouldApplyRemovals(readCount: number, existingCount: number): boolean {
  return readCount > 0 || existingCount === 0;
}
