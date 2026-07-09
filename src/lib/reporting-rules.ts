/**
 * Reporting (Module 5) — PURE rules (no I/O), unit-tested without a database.
 * Segments the synced dossiers along a dimension and computes the same
 * indicators as the direction dashboard per segment, and serializes a flat
 * export (BPF / bilan). Reuses the compliance KPI logic so a rate always carries
 * its effectif and is hidden when n = 0 (CA-T5).
 */
import { computeKpis, type ComplianceRow, type DirectionKpis } from "./compliance-rules.ts";

export type Dimension = "program" | "financer" | "status";

export const DIMENSION_LABELS: Record<Dimension, string> = {
  program: "Programme",
  financer: "Financeur",
  status: "Statut",
};

export interface ReportRow extends ComplianceRow {
  program: string | null;
  specialty: string | null;
  financer: string | null;
  start_date: string | null;
}

export interface Segment {
  /** The dimension value (e.g. a program name), or "—" when null. */
  key: string;
  kpis: DirectionKpis;
}

const dimValue = (r: ReportRow, dim: Dimension): string => {
  const v = dim === "program" ? r.program : dim === "financer" ? r.financer : r.status;
  return v && v.trim() !== "" ? v : "—";
};

/** Group rows by a dimension and compute per-segment KPIs, largest segment first
 *  (ties broken alphabetically for a stable order). */
export function segmentBy(rows: ReportRow[], dim: Dimension): Segment[] {
  const groups = new Map<string, ReportRow[]>();
  for (const r of rows) {
    const k = dimValue(r, dim);
    (groups.get(k) ?? groups.set(k, []).get(k)!).push(r);
  }
  return [...groups.entries()]
    .map(([key, rs]) => ({ key, kpis: computeKpis(rs) }))
    .sort((a, b) => b.kpis.total - a.kpis.total || a.key.localeCompare(b.key));
}

/** The calendar year of an ISO date (YYYY-…), or null. */
export function yearOf(dateIso: string | null): string | null {
  const m = dateIso?.match(/^(\d{4})/);
  return m ? m[1] : null;
}

/** Distinct start-date years present in the rows, most recent first. */
export function reportYears(rows: ReportRow[]): string[] {
  return [...new Set(rows.map((r) => yearOf(r.start_date)).filter((y): y is string => !!y))].sort().reverse();
}

// --- CSV ---------------------------------------------------------------------
/** RFC-4180 escaping + formula-injection guard: a TEXT cell starting with
 *  = + - @ (or a control char) is prefixed with a quote so a spreadsheet does
 *  not execute it as a formula. Numbers pass through unchanged. */
export function csvEscape(value: unknown): string {
  if (value == null) return "";
  let s = String(value);
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Serialize a header + rows to CSV text (CRLF line endings). */
export function toCsv(headers: string[], rows: (unknown[])[]): string {
  const lines = [headers, ...rows].map((cols) => cols.map(csvEscape).join(","));
  return lines.join("\r\n");
}

/** Column headers for the per-dossier regulatory export (BPF / bilan). */
export const EXPORT_HEADERS = [
  "Apprenant", "E-mail", "Programme", "Spécialité", "Financeur", "Statut",
  "Début", "Avancement (%)", "Certification", "Résultat jury", "Insertion", "Satisfaction",
];

export interface ExportRow extends ReportRow {
  learnerName: string;
  email: string;
  progress: number | null;
  jury_result: string | null;
}

/** One CSV line per dossier, matching EXPORT_HEADERS. */
export function exportRowValues(r: ExportRow): unknown[] {
  return [
    r.learnerName,
    r.email,
    r.program ?? "",
    r.specialty ?? "",
    r.financer ?? "",
    r.status ?? "",
    r.start_date ?? "",
    r.progress != null ? Math.round(r.progress * 100) : "",
    r.certification ?? "",
    r.jury_result ?? "",
    r.insertion_situation ?? "",
    r.satisfaction_score ?? "",
  ];
}
