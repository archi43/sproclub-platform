// NB: pas de "server-only" ici — importé par les tests Node (même convention que
// fillout.ts). Ne jamais importer depuis un composant client.
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildEnrollment, buildLearner, normalizeEmail, SRC, type SourceRecord } from "./mapping.ts";

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
  skippedErased: number;
  learners: number;
  enrollments: number;
  /** E-mails modifiés dans Airtable, mis à jour en place (même personne). */
  emailUpdated: number;
  /** Nouvel e-mail déjà pris par un autre apprenant : record écarté, pas d'échec global. */
  emailConflicts: number;
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
  const stats: SyncStats = { source: source.length, skippedNoEmail: 0, skippedErased: 0, learners: 0, enrollments: 0, emailUpdated: 0, emailConflicts: 0 };

  // Right-to-erasure suppression list (INC-11): never re-import a learner whose
  // PII was erased — otherwise the sync would undo the anonymization.
  const { data: erasures } = await admin.from("data_erasures").select("learner_email").eq("org_id", orgId);
  const erased = new Set((erasures ?? []).map((r) => (r as { learner_email: string }).learner_email));

  // --- Pass 1: learners, deduplicated by e-mail (last record wins) ----------
  const byEmail = new Map<string, ReturnType<typeof buildLearner>>();
  for (const rec of source) {
    const learner = buildLearner(rec);
    if (!learner) continue;
    if (erased.has(learner.email)) {
      stats.skippedErased++;
      continue; // suppressed person: leave the anonymized row untouched
    }
    byEmail.set(learner.email, learner);
  }
  // --- Pass 1b : e-mails modifiés dans Airtable ------------------------------
  // L'upsert ci-dessous est clé sur (org_id, email) : un e-mail changé côté
  // Airtable tenterait d'INSÉRER une seconde ligne avec le même
  // airtable_record_id (unique) et ferait échouer toute la sync (incident du
  // 15/07/2026). Même personne = même ligne : on met l'e-mail à jour en place,
  // puis l'upsert retombe sur la ligne rafraîchie. Si le nouvel e-mail est déjà
  // pris par un AUTRE apprenant, on écarte ce record (compté, pas fatal).
  const candidates = [...byEmail.values()] as NonNullable<ReturnType<typeof buildLearner>>[];
  const existingByRecord = new Map<string, string>();
  for (const group of chunk(candidates.map((l) => l.airtable_record_id), CHUNK)) {
    const { data: existing, error } = await admin
      .from("learners_ro")
      .select("airtable_record_id, email")
      .eq("org_id", orgId)
      .in("airtable_record_id", group);
    if (error) throw new Error(`sync learners lookup: ${error.message}`);
    for (const row of existing ?? []) existingByRecord.set(row.airtable_record_id as string, row.email as string);
  }
  for (const l of candidates) {
    const knownEmail = existingByRecord.get(l.airtable_record_id);
    if (!knownEmail || knownEmail === l.email) continue;
    const { error } = await admin
      .from("learners_ro")
      .update({ email: l.email, synced_at: now })
      .eq("org_id", orgId)
      .eq("airtable_record_id", l.airtable_record_id);
    if (error) {
      stats.emailConflicts++;
      byEmail.delete(l.email); // ne pas retenter l'insert : il violerait l'unicité du record id
      console.warn(`[sync] e-mail conflict on ${l.airtable_record_id}: ${error.message}`);
    } else {
      stats.emailUpdated++;
    }
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

  // --- Observability -------------------------------------------------------
  // Explicit: how many source records were skipped and why (no usable e-mail),
  // so a drop in the synced count is never a silent loss.
  console.log(
    `[sync] commandes_formation: source=${stats.source} skipped_no_email=${stats.skippedNoEmail} ` +
      `learners=${stats.learners} enrollments=${stats.enrollments}`
  );
  await admin.from("sync_log").insert({
    entity: "commandes_formation",
    direction: "airtable_to_pg",
    status: "ok",
    detail: JSON.stringify({ ...stats, skipReason: "source record without a usable e-mail" }),
  });

  return stats;
}
