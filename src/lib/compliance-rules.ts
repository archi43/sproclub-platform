/**
 * Conformité & pilotage — PURE business rules (no I/O, no server-only), so they
 * can be unit-tested without a database. Used by the data layer
 * (`src/lib/data/compliance.ts`) and the S3.1 / S0.1 screens.
 *
 * Key rule CA-T5: a rate is always shown with its effectif, and hidden (null)
 * when the effectif is zero — never displayed as 0 %.
 */

export interface ComplianceRow {
  status: string | null;
  /** Date d'entrée en formation : décide si le dossier entre dans le périmètre
   *  de la règle de complétude (voir `COMPLIANCE_SCOPE_START`). */
  start_date: string | null;
  certification: string | null;
  global_grade: number | null;
  insertion_situation: string | null;
  satisfaction_score: number | null;
  nps: number | null;
  attestation_entry_sent: boolean | null;
  convention_signed: boolean | null;
  pending_reports: number | null;
}

export interface Piece {
  key: string;
  label: string;
  present: boolean;
}

/** The obligatory pieces of a dossier (CDC S3.1) and whether each is present.
 *  Order = the order shown in the grid. */
export function compliancePieces(e: ComplianceRow): Piece[] {
  return [
    { key: "attestation_entry", label: "Attestation d'entrée", present: e.attestation_entry_sent === true },
    { key: "convention", label: "Convention", present: e.convention_signed === true },
    { key: "reports", label: "Comptes rendus", present: (e.pending_reports ?? 0) === 0 },
    { key: "defense_grade", label: "Note de soutenance", present: e.global_grade != null },
    { key: "certification", label: "Certification", present: e.certification === "Oui" },
    { key: "insertion", label: "Insertion", present: !!e.insertion_situation },
    { key: "satisfaction", label: "Questionnaire", present: e.satisfaction_score != null || e.nps != null },
  ];
}

/** Completeness ratio in [0,1] over the obligatory pieces. */
export function completenessScore(e: ComplianceRow): number {
  const pieces = compliancePieces(e);
  const present = pieces.filter((p) => p.present).length;
  return pieces.length === 0 ? 1 : present / pieces.length;
}

const isFinished = (status: string | null) => status === "Terminé";

/**
 * Entrée en vigueur de la règle de complétude (décision de direction,
 * 2026-11-06). Seuls les dossiers dont l'**entrée en formation** est postérieure
 * à cette date sont contrôlés.
 *
 * Pourquoi un seuil plutôt qu'un contrôle universel : appliquée à tout le stock,
 * la règle déclarait **405 dossiers non conformes sur 405**, parce que trois des
 * pièces exigées ne sont presque jamais renseignées sur les dossiers anciens
 * (convention 3 %, certification 7 %, insertion 45 %). Une alerte qui concerne
 * 100 % des cas n'alerte plus de rien. La direction a tranché : le stock
 * historique sort du périmètre, la règle vaut pour les nouveaux entrants.
 *
 * Au 2026-11-06 : aucun des 405 dossiers terminés n'entre dans ce périmètre, et
 * 32 dossiers en cours ou à venir y sont déjà (entrées du 2 novembre 2026 au
 * 5 avril 2027). Ils seront contrôlés à leur terme.
 */
export const COMPLIANCE_SCOPE_START = "2026-11-01";

/**
 * Le dossier est-il soumis à la règle de complétude ?
 *
 * Une date d'entrée absente met le dossier **hors périmètre** : on ne peut pas
 * affirmer qu'un dossier est un nouvel entrant sans savoir quand il a commencé,
 * et alerter sur un doute produirait du bruit plutôt qu'une information. Aucun
 * dossier terminé n'est dans ce cas aujourd'hui (5 dossiers sans date, tous
 * encore ouverts) ; l'écran Conformité reste l'endroit où ces trous se voient.
 */
export function isInComplianceScope(e: ComplianceRow): boolean {
  return e.start_date != null && e.start_date >= COMPLIANCE_SCOPE_START;
}

/** A finished dossier IN SCOPE missing at least one obligatory piece — in red. */
export function isNonConforming(e: ComplianceRow): boolean {
  return isFinished(e.status) && isInComplianceScope(e) && completenessScore(e) < 1;
}

export interface Rate {
  /** Ratio in [0,1] (or a mean for average()). */
  value: number;
  /** Effectif — always shown alongside the rate. */
  n: number;
}

/** A rate is only meaningful with a non-zero effectif; otherwise hidden (null),
 *  never displayed as 0 %. */
export function rate(numerator: number, denominator: number): Rate | null {
  if (denominator <= 0) return null;
  return { value: numerator / denominator, n: denominator };
}

/** Mean of the defined numbers, with its effectif; null when none are defined. */
export function average(values: (number | null)[]): Rate | null {
  const defined = values.filter((v): v is number => v != null);
  if (defined.length === 0) return null;
  return { value: defined.reduce((a, b) => a + b, 0) / defined.length, n: defined.length };
}

export interface DirectionKpis {
  active: number;
  finished: number;
  paused: number;
  total: number;
  certification: Rate | null;
  insertion: Rate | null;
  satisfaction: Rate | null;
  nps: Rate | null;
  nonConforming: number;
  /** Dossiers terminés effectivement contrôlés (dans le périmètre de la règle). */
  inScope: number;
}

/** Compute the S0.1 headline indicators from the caller's authorized rows. */
export function computeKpis(rows: ComplianceRow[]): DirectionKpis {
  const active = rows.filter((r) => r.status === "En cours").length;
  const finished = rows.filter((r) => r.status === "Terminé").length;
  const paused = rows.filter((r) => r.status === "En pause").length;

  const certAttempted = rows.filter((r) => r.certification === "Oui" || r.certification === "Non").length;
  const certSuccess = rows.filter((r) => r.certification === "Oui").length;

  const insertionKnown = rows.filter((r) => !!r.insertion_situation).length;
  const insertionPlaced = rows.filter((r) => r.insertion_situation === "En poste").length;

  return {
    active,
    finished,
    paused,
    total: rows.length,
    certification: rate(certSuccess, certAttempted),
    insertion: rate(insertionPlaced, insertionKnown),
    satisfaction: average(rows.map((r) => r.satisfaction_score)),
    nps: average(rows.map((r) => r.nps)),
    nonConforming: rows.filter(isNonConforming).length,
    // Effectif du périmètre : sans lui, « 0 non conforme sur 405 terminés »
    // laisserait croire que les 405 ont été contrôlés.
    inScope: rows.filter((r) => isFinished(r.status) && isInComplianceScope(r)).length,
  };
}
