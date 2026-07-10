// NB: pas de "server-only" ici — importé par les tests Node. Ne jamais importer depuis un composant client.
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Plateforme → Airtable write-back (INC-14). Pushes coach evaluation reports
 * (coaching_reports) into the SproCLUB "Comptes rendus -header" table.
 *
 * Safety model:
 *   - CREATE only — never PATCH/DELETE an existing Airtable record;
 *   - idempotent — a report is pushed once (airtable_synced flag + stored id);
 *   - gated by AIRTABLE_WRITEBACK_ENABLED=true AND a write-scoped token, so the
 *     daily cron degrades gracefully until credentials are upgraded;
 *   - defenses (Soutenances) are intentionally NOT pushed: that table mirrors
 *     Google Calendar, which Cal.eu already feeds — pushing would duplicate.
 */
export interface WritebackStats {
  enabled: boolean;
  pending: number;
  pushed: number;
  skippedNoCommande: number;
}

interface ReportRow {
  id: string;
  enrollment_id: string;
  session_date: string | null;
  created_at: string;
  body: string;
  grade: number | null;
  source: string;
}

/** Champs Airtable pour un compte rendu (builder pur, testé unitairement). */
export function buildCrFields(
  report: Pick<ReportRow, "session_date" | "created_at" | "body" | "grade" | "source">,
  ctx: { commandeRecordId: string; learnerName: string }
): Record<string, unknown> {
  const note = report.grade != null ? `\n\nNote : ${report.grade}/4` : "";
  const origin = report.source === "fillout" ? "Évaluation Fillout (via plateforme)" : "Coaching — plateforme SproCLUB";
  return {
    "Date épreuve": report.session_date ?? report.created_at.slice(0, 10),
    "Commentaires": `${report.body}${note}`,
    "Prénom & Nom Candidat": ctx.learnerName,
    "Sales Orders-header": [ctx.commandeRecordId],
    "Situation d'évaluation": origin,
  };
}

const AIRTABLE_REC_RE = /^rec[A-Za-z0-9]{14}$/;
const BATCH = 10;

export async function pushCoachingReports(admin: SupabaseClient, orgId: string): Promise<WritebackStats> {
  const stats: WritebackStats = { enabled: false, pending: 0, pushed: 0, skippedNoCommande: 0 };
  const apiKey = process.env.AIRTABLE_API_KEY;
  const baseId = process.env.AIRTABLE_BASE_ID;
  const tableId = process.env.AIRTABLE_CR_TABLE_ID ?? "tbl4Jek8RZFfZE4Eu";
  if (process.env.AIRTABLE_WRITEBACK_ENABLED !== "true" || !apiKey || !baseId) return stats;
  stats.enabled = true;

  const { data: reports, error: re } = await admin
    .from("coaching_reports")
    .select("id, enrollment_id, session_date, created_at, body, grade, source")
    .eq("org_id", orgId)
    .eq("airtable_synced", false)
    .limit(200);
  if (re) throw new Error(`writeback reports: ${re.message}`);
  const pending = (reports ?? []) as ReportRow[];
  stats.pending = pending.length;
  if (pending.length === 0) return stats;

  // Résoudre dossier -> record Airtable source + nom de l'apprenant.
  const enrollmentIds = [...new Set(pending.map((r) => r.enrollment_id))];
  const { data: enrollments, error: ee } = await admin
    .from("enrollments_ro")
    .select("id, airtable_record_id, learner:learners_ro(first_name, last_name, email)")
    .eq("org_id", orgId)
    .in("id", enrollmentIds);
  if (ee) throw new Error(`writeback enrollments: ${ee.message}`);
  type EnrRow = { id: string; airtable_record_id: string; learner: { first_name: string | null; last_name: string | null; email: string } | null };
  const enrById = new Map(((enrollments ?? []) as unknown as EnrRow[]).map((e) => [e.id, e]));

  // Construire les payloads (uniquement les dossiers réellement issus d'Airtable).
  const items: { reportId: string; fields: Record<string, unknown> }[] = [];
  for (const r of pending) {
    const enr = enrById.get(r.enrollment_id);
    if (!enr || !AIRTABLE_REC_RE.test(enr.airtable_record_id)) {
      stats.skippedNoCommande++;
      continue;
    }
    const learnerName =
      [enr.learner?.first_name, enr.learner?.last_name].filter(Boolean).join(" ") || enr.learner?.email || "—";
    items.push({ reportId: r.id, fields: buildCrFields(r, { commandeRecordId: enr.airtable_record_id, learnerName }) });
  }

  for (let i = 0; i < items.length; i += BATCH) {
    const group = items.slice(i, i + BATCH);
    const res = await fetch(`https://api.airtable.com/v0/${baseId}/${tableId}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ records: group.map((g) => ({ fields: g.fields })), typecast: true }),
    });
    if (!res.ok) throw new Error(`Airtable writeback failed: ${res.status} ${await res.text()}`);
    const created = (await res.json()) as { records: { id: string }[] };
    // Marquer chaque CR comme synchronisé avec l'id Airtable créé (ordre préservé).
    for (let j = 0; j < group.length; j++) {
      const { error } = await admin
        .from("coaching_reports")
        .update({ airtable_synced: true, airtable_record_id: created.records[j]?.id ?? null })
        .eq("id", group[j].reportId);
      if (error) throw new Error(`writeback mark synced: ${error.message}`);
      stats.pushed++;
    }
  }

  await admin.from("sync_log").insert({
    entity: "coaching_reports",
    direction: "pg_to_airtable",
    status: "ok",
    detail: JSON.stringify(stats),
  });
  return stats;
}
