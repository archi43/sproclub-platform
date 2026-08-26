/**
 * Synthèse d'un écran-liste — règles **pures** (INC-22).
 *
 * La bande de tuiles en haut d'une liste porte des chiffres que la coordination
 * lit d'un coup d'œil. Ces chiffres décrivent **la sélection affichée**, pas
 * tout l'organisme : le libellé de l'écran doit le dire, sinon on croit lire un
 * indicateur de pilotage.
 *
 * Module autonome, sans import : c'est la convention des règles pures du projet
 * (elles doivent tourner sous `node --test`, qui ne résout pas l'alias `@/`).
 * Le pourcentage arrive donc déjà normalisé par l'appelant (`progressPercent`),
 * ce qui évite de dupliquer ici la gestion des deux échelles 0–1 / 0–100.
 */

/** Statuts réels des dossiers, tels que synchronisés depuis Airtable. */
export const FINISHED_STATUS = "Terminé";

export interface SummarizableDossier {
  status: string | null;
  lateDays: number | null;
  /** Avancement déjà ramené sur 0–100, ou `null` s'il est inconnu. */
  percent: number | null;
}

export interface DossierSummary {
  /** Dossiers affichés, c'est-à-dire correspondant aux filtres posés. */
  shown: number;
  /** Dossiers en retard : au moins un jour. */
  late: number;
  /** Dossiers au statut « Terminé ». */
  finished: number;
  /** Moyenne des avancements connus, arrondie ; `null` si aucun n'est connu. */
  averageProgress: number | null;
}

const isLate = (d: SummarizableDossier) => (d.lateDays ?? 0) > 0;

/**
 * Résume une sélection de dossiers. Les avancements inconnus sont **exclus** de
 * la moyenne au lieu d'être comptés comme zéro : compter un dossier non
 * renseigné comme nul ferait chuter la moyenne sans qu'aucun apprenant n'ait
 * pris de retard.
 */
export function summarizeDossiers(rows: readonly SummarizableDossier[]): DossierSummary {
  const known = rows.filter((r) => r.percent != null).map((r) => r.percent as number);
  const averageProgress = known.length
    ? Math.round(known.reduce((sum, p) => sum + p, 0) / known.length)
    : null;

  return {
    shown: rows.length,
    late: rows.filter(isLate).length,
    finished: rows.filter((r) => r.status === FINISHED_STATUS).length,
    averageProgress,
  };
}
