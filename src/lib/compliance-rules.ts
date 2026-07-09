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

/** A finished dossier missing at least one obligatory piece — surfaced in red. */
export function isNonConforming(e: ComplianceRow): boolean {
  return isFinished(e.status) && completenessScore(e) < 1;
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
  };
}
