import "server-only";
import { createClient } from "@/lib/supabase/server";
import {
  compliancePieces,
  completenessScore,
  isNonConforming,
  computeKpis,
  type ComplianceRow,
  type Piece,
  type DirectionKpis,
} from "@/lib/compliance-rules";

/**
 * Conformité (Module 3 / S3.1) + pilotage direction (Module 0 / S0.1) — data
 * access. Read-only analytics over the synced `enrollments_ro`; RLS scopes the
 * rows (direction/coordinator all; coach own). The scoring / rate logic lives in
 * `@/lib/compliance-rules` (pure, unit-tested).
 */

export type { Piece, Rate, DirectionKpis } from "@/lib/compliance-rules";

const COLS =
  "id, learner_id, program, financer, status, certification, global_grade, insertion_situation, " +
  "satisfaction_score, nps, attestation_entry_sent, convention_signed, pending_reports, " +
  "learner:learners_ro(first_name, last_name, email)";

type Raw = ComplianceRow & {
  id: string;
  learner_id: string;
  program: string | null;
  financer: string | null;
  learner: { first_name: string | null; last_name: string | null; email: string } | null;
};

async function fetchRows(orgId: string, filters: { program?: string; cpfOnly?: boolean }): Promise<Raw[]> {
  const supabase = createClient();
  let q = supabase.from("enrollments_ro").select(COLS).eq("org_id", orgId).limit(2000);
  if (filters.program) q = q.eq("program", filters.program);
  if (filters.cpfOnly) q = q.eq("financer", "CPF");
  const { data, error } = await q;
  if (error) throw new Error(`Failed to load compliance rows: ${error.message}`);
  return (data ?? []) as unknown as Raw[];
}

export interface DossierCompleteness {
  enrollmentId: string;
  learnerId: string;
  learnerName: string;
  program: string | null;
  financer: string | null;
  status: string | null;
  pieces: Piece[];
  score: number;
  nonConforming: boolean;
}

const fullName = (l: Raw["learner"]) =>
  [l?.first_name, l?.last_name].filter(Boolean).join(" ") || (l?.email ?? "—");

function toCompleteness(r: Raw): DossierCompleteness {
  return {
    enrollmentId: r.id,
    learnerId: r.learner_id,
    learnerName: fullName(r.learner),
    program: r.program,
    financer: r.financer,
    status: r.status,
    pieces: compliancePieces(r),
    score: completenessScore(r),
    nonConforming: isNonConforming(r),
  };
}

/** S3.1 — per-dossier completeness grid, most-incomplete first. */
export async function listDossierCompleteness(
  orgId: string,
  filters: { program?: string; cpfOnly?: boolean } = {}
): Promise<DossierCompleteness[]> {
  const rows = await fetchRows(orgId, filters);
  return rows
    .map(toCompleteness)
    .sort((a, b) => Number(b.nonConforming) - Number(a.nonConforming) || a.score - b.score);
}

/** S0.1 — direction dashboard: KPIs + the non-conforming finished dossiers. */
export async function directionDashboard(
  orgId: string,
  filters: { program?: string } = {}
): Promise<{ kpis: DirectionKpis; nonConforming: DossierCompleteness[] }> {
  const rows = await fetchRows(orgId, filters);
  return {
    kpis: computeKpis(rows),
    nonConforming: rows.filter(isNonConforming).map(toCompleteness),
  };
}

/** Distinct program names for the filters. */
export async function compliancePrograms(orgId: string): Promise<string[]> {
  const supabase = createClient();
  const { data } = await supabase.from("enrollments_ro").select("program").eq("org_id", orgId).limit(2000);
  return [...new Set((data ?? []).map((r) => r.program).filter(Boolean) as string[])].sort();
}
