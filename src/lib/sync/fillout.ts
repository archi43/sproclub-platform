// NB: pas de "server-only" ici — importé par les tests Node. Ne jamais importer depuis un composant client.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { FilloutSubmission } from "@/lib/sync/fillout-source";

/**
 * Fillout → coaching_reports (INC-14). Idempotent: upsert on
 * fillout_submission_id, so re-running never duplicates. A submission is
 * attached to the learner matched by e-mail (normalized) and their most recent
 * enrollment; submissions without a matching learner are counted, not lost.
 */
export interface FilloutSyncStats {
  source: number;
  inserted: number;
  skippedNoEmail: number;
  skippedUnknownEmail: number;
}

export async function syncFillout(
  admin: SupabaseClient,
  orgId: string,
  submissions: FilloutSubmission[]
): Promise<FilloutSyncStats> {
  const stats: FilloutSyncStats = { source: submissions.length, inserted: 0, skippedNoEmail: 0, skippedUnknownEmail: 0 };
  if (submissions.length === 0) return stats;

  // Résoudre e-mail -> (learner, dossier le plus récent) en 2 requêtes.
  const emails = [...new Set(submissions.map((s) => s.email).filter(Boolean))] as string[];
  const { data: learners, error: le } = await admin
    .from("learners_ro")
    .select("id, email")
    .eq("org_id", orgId)
    .in("email", emails);
  if (le) throw new Error(`fillout learners lookup: ${le.message}`);
  const learnerByEmail = new Map((learners ?? []).map((l) => [l.email as string, l.id as string]));

  const learnerIds = [...learnerByEmail.values()];
  const enrollmentByLearner = new Map<string, string>();
  if (learnerIds.length > 0) {
    const { data: enrollments, error: ee } = await admin
      .from("enrollments_ro")
      .select("id, learner_id, start_date")
      .eq("org_id", orgId)
      .in("learner_id", learnerIds)
      .order("start_date", { ascending: false, nullsFirst: false });
    if (ee) throw new Error(`fillout enrollments lookup: ${ee.message}`);
    for (const e of enrollments ?? []) {
      const lid = e.learner_id as string;
      if (!enrollmentByLearner.has(lid)) enrollmentByLearner.set(lid, e.id as string); // first = latest
    }
  }

  const rows: Record<string, unknown>[] = [];
  for (const s of submissions) {
    if (!s.email) {
      stats.skippedNoEmail++;
      continue;
    }
    const learnerId = learnerByEmail.get(s.email);
    const enrollmentId = learnerId ? enrollmentByLearner.get(learnerId) : undefined;
    if (!enrollmentId) {
      stats.skippedUnknownEmail++;
      continue;
    }
    rows.push({
      org_id: orgId,
      enrollment_id: enrollmentId,
      source: "fillout",
      fillout_submission_id: s.submissionId,
      session_date: s.submittedAt?.slice(0, 10) || null,
      body: s.body || "(soumission vide)",
      grade: s.grade ?? null,
      author_id: null,
    });
  }

  if (rows.length > 0) {
    const { error } = await admin
      .from("coaching_reports")
      .upsert(rows, { onConflict: "fillout_submission_id", ignoreDuplicates: true });
    if (error) throw new Error(`fillout upsert: ${error.message}`);
    stats.inserted = rows.length;
  }

  await admin.from("sync_log").insert({
    entity: "fillout_evaluations",
    direction: "fillout_to_pg",
    status: "ok",
    detail: JSON.stringify(stats),
  });
  return stats;
}
