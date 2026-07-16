// NB: règles pures (aucune I/O) — testées hors DB, partagées UI + couche data.

/**
 * Jobboard (INC-18) — machine à états de modération d'une offre.
 *
 * Cycle : le partenaire crée en `pending` ; la coordination `published` ou
 * `rejected` ; une offre rejetée peut être re-soumise par le partenaire
 * (`pending`) ; le partenaire peut `archived` sa propre offre. Le garde-fou
 * serveur (trigger `protect_job_offer_moderation`, 0026) applique exactement
 * ces règles ; cette fonction pure les partage avec l'UI (afficher/masquer les
 * boutons) et est prouvée par test.
 */

export type JobStatus = "pending" | "published" | "rejected" | "archived";
export type JobActor = "partner" | "staff";

export const JOB_STATUS_LABELS: Record<JobStatus, string> = {
  pending: "En attente de validation",
  published: "Publiée",
  rejected: "Rejetée",
  archived: "Archivée",
};

const TRANSITIONS: Record<JobActor, Partial<Record<JobStatus, JobStatus[]>>> = {
  // La coordination modère : publie ou rejette une offre en attente, peut
  // dépublier (→ archived) et re-publier une offre rejetée.
  staff: {
    pending: ["published", "rejected"],
    published: ["archived"],
    rejected: ["published", "archived"],
    archived: ["published"],
  },
  // Le partenaire re-soumet une offre rejetée ou archive la sienne.
  partner: {
    rejected: ["pending"],
    published: ["archived"],
    pending: ["archived"],
  },
};

export function canTransition(actor: JobActor, from: JobStatus, to: JobStatus): boolean {
  return (TRANSITIONS[actor][from] ?? []).includes(to);
}

export function allowedTransitions(actor: JobActor, from: JobStatus): JobStatus[] {
  return TRANSITIONS[actor][from] ?? [];
}

/** Un partenaire peut-il encore éditer le contenu de l'offre ? (pas une fois
 *  publiée : toute modification devrait repasser en modération). */
export function canEditContent(actor: JobActor, status: JobStatus): boolean {
  if (actor === "staff") return true;
  return status === "pending" || status === "rejected";
}
