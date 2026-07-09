import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import {
  segmentBy,
  reportYears,
  toCsv,
  EXPORT_HEADERS,
  exportRowValues,
  type Dimension,
  type Segment,
  type ExportRow,
} from "@/lib/reporting-rules";

/**
 * Reporting (Module 5) — data access. Read-only over the synced `enrollments_ro`
 * (RLS scopes the rows). The segmentation / CSV logic lives in the pure
 * `@/lib/reporting-rules` (unit-tested). No new policy.
 */

export type { Dimension, Segment } from "@/lib/reporting-rules";

export interface ReportFilters {
  program?: string;
  financer?: string;
  year?: string;
}

const COLS =
  "id, learner_id, program, specialty, financer, status, start_date, progress, certification, " +
  "global_grade, jury_result, insertion_situation, satisfaction_score, nps, attestation_entry_sent, " +
  "convention_signed, pending_reports, learner:learners_ro(first_name, last_name, email)";

type Raw = {
  id: string;
  learner_id: string;
  program: string | null;
  specialty: string | null;
  financer: string | null;
  status: string | null;
  start_date: string | null;
  progress: number | null;
  certification: string | null;
  global_grade: number | null;
  jury_result: string | null;
  insertion_situation: string | null;
  satisfaction_score: number | null;
  nps: number | null;
  attestation_entry_sent: boolean | null;
  convention_signed: boolean | null;
  pending_reports: number | null;
  learner: { first_name: string | null; last_name: string | null; email: string } | null;
};

const fullName = (l: Raw["learner"]) =>
  [l?.first_name, l?.last_name].filter(Boolean).join(" ") || (l?.email ?? "—");

/** Fetch the reporting rows for the given client's scope (RLS server client for
 *  interactive use; service-role client for the trusted periodic cron). */
async function fetchRows(supabase: SupabaseClient, orgId: string, filters: ReportFilters): Promise<ExportRow[]> {
  let q = supabase.from("enrollments_ro").select(COLS).eq("org_id", orgId).limit(5000);
  if (filters.program) q = q.eq("program", filters.program);
  if (filters.financer) q = q.eq("financer", filters.financer);
  if (filters.year) q = q.gte("start_date", `${filters.year}-01-01`).lte("start_date", `${filters.year}-12-31`);
  const { data, error } = await q;
  if (error) throw new Error(`Failed to load reporting rows: ${error.message}`);

  return ((data ?? []) as unknown as Raw[]).map((r) => ({
    ...r,
    learnerName: fullName(r.learner),
    email: r.learner?.email ?? "",
  }));
}

export interface ReportView {
  segments: Segment[];
  total: number;
  years: string[];
  programs: string[];
  financers: string[];
}

/** Segmented dashboard view for the reporting screen (RLS server client). */
export async function getReport(orgId: string, dimension: Dimension, filters: ReportFilters): Promise<ReportView> {
  const supabase = createClient();
  const rows = await fetchRows(supabase, orgId, filters);
  // Filter options come from the UNfiltered set so the user can widen again.
  const all = await fetchRows(supabase, orgId, {});
  const uniq = (xs: (string | null)[]) => [...new Set(xs.filter(Boolean) as string[])].sort();
  return {
    segments: segmentBy(rows, dimension),
    total: rows.length,
    years: reportYears(all),
    programs: uniq(all.map((r) => r.program)),
    financers: uniq(all.map((r) => r.financer)),
  };
}

/** Build the dated regulatory CSV export. Pass the RLS server client for the
 *  interactive route, or a service-role client for the trusted periodic cron. */
export async function buildExportCsv(
  supabase: SupabaseClient,
  orgId: string,
  filters: ReportFilters
): Promise<{ csv: string; rows: number }> {
  const rows = await fetchRows(supabase, orgId, filters);
  return { csv: toCsv(EXPORT_HEADERS, rows.map(exportRowValues)), rows: rows.length };
}
