import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildEnrollment, buildLearner, normalizeEmail, SRC, type SourceRecord } from "@/lib/sync/mapping";

/**
 * Airtable → Postgres sync engine (INC-1). Idempotent and org-scoped:
 *   - learners_ro upserted on (org_id, email) — a person is one row;
 *   - enrollments_ro upserted on airtable_record_id — the source Commande id.
 * Re-running produces no duplicates. Airtable is read elsewhere (this takes an
 * already-fetched source array, which also makes it unit-testable without keys).
 * Runs with a trusted (service-role) client.
 */
export interface SyncStats {
  source: number;
  skippedNoEmail: number;
  learners: number;
  enrollments: number;
}

const CHUNK = 500;
function chunk<T>(a: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < a.length; i += n) out.push(a.slice(i, i + n));
  return out;
}

export async function syncCommandes(
  admin: SupabaseClient,
  orgId: string,
  source: SourceRecord[]
): Promise<SyncStats> {
  const now = new Date().toISOString();
  const stats: SyncStats = { source: source.length, skippedNoEmail: 0, learners: 0, enrollments: 0 };

  // --- Pass 1: learners, deduplicated by e-mail (last record wins) ----------
  const byEmail = new Map<string, ReturnType<typeof buildLearner>>();
  for (const rec of source) {
    const learner = buildLearner(rec);
    if (!learner) continue;
    byEmail.set(learner.email, learner);
  }
  const learnerRows = [...byEmail.values()].map((l) => ({ ...l!, org_id: orgId, synced_at: now }));

  const emailToId = new Map<string, string>();
  for (const group of chunk(learnerRows, CHUNK)) {
    const { data, error } = await admin
      .from("learners_ro")
      .upsert(group, { onConflict: "org_id,email" })
      .select("id, email");
    if (error) throw new Error(`sync learners: ${error.message}`);
    for (const row of data ?? []) emailToId.set(row.email as string, row.id as string);
    stats.learners += group.length;
  }

  // --- Pass 2: enrollments, keyed by source record id -----------------------
  const enrollmentRows: Record<string, unknown>[] = [];
  for (const rec of source) {
    const email = normalizeEmail(rec.fields[SRC.email]);
    if (!email) {
      stats.skippedNoEmail++;
      continue;
    }
    const learnerId = emailToId.get(email);
    if (!learnerId) continue; // learner upsert failed for this e-mail
    enrollmentRows.push({ ...buildEnrollment(rec), org_id: orgId, learner_id: learnerId, synced_at: now });
  }

  for (const group of chunk(enrollmentRows, CHUNK)) {
    const { error } = await admin
      .from("enrollments_ro")
      .upsert(group, { onConflict: "airtable_record_id" });
    if (error) throw new Error(`sync enrollments: ${error.message}`);
    stats.enrollments += group.length;
  }

  // --- Observability: one summary row in sync_log ---------------------------
  await admin.from("sync_log").insert({
    entity: "commandes_formation",
    direction: "airtable_to_pg",
    status: "ok",
    detail: JSON.stringify(stats),
  });

  return stats;
}
