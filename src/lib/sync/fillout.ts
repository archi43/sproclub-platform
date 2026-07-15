// NB: pas de "server-only" ici — importé par les tests Node. Ne jamais importer depuis un composant client.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { FilloutSubmission } from "@/lib/sync/fillout-source";

/**
 * Fillout → coaching_reports (INC-14, jointure INC-16). Idempotent: upsert on
 * fillout_submission_id, so re-running never duplicates. A submission is
 * attached to its exact enrollment via the Airtable recordIDs of its
 * RecordPickers : match direct sur la Commande (« Etudiant(s) »,
 * « Sales Orders-header »), sinon via la map Soutenance → Commande (injectée,
 * formulaires d'évaluation/soutenance), sinon repli e-mail (dossier le plus
 * récent). Unmatched submissions are counted, not lost.
 */
export interface FilloutSyncStats {
  source: number;
  inserted: number;
  matchedByRecordId: number; // RecordPicker → Commande, direct
  matchedViaSoutenance: number; // RecordPicker Soutenance → Commande (map Airtable)
  skippedNoEmail: number; // aucun identifiant exploitable (ni recordID ni e-mail)
  skippedUnknownEmail: number; // identifiant présent mais inconnu de la base
}

export async function syncFillout(
  admin: SupabaseClient,
  orgId: string,
  submissions: FilloutSubmission[],
  soutenanceToCommande: Map<string, string> = new Map()
): Promise<FilloutSyncStats> {
  const stats: FilloutSyncStats = { source: submissions.length, inserted: 0, matchedByRecordId: 0, matchedViaSoutenance: 0, skippedNoEmail: 0, skippedUnknownEmail: 0 };
  if (submissions.length === 0) return stats;

  // Résolution prioritaire : recordIDs Airtable candidats → dossier exact.
  // On tente chaque candidat directement (Commande) ET via la map
  // Soutenance → Commande ; une seule requête pour tous les ids possibles.
  const candidateIds = new Set<string>();
  for (const s of submissions) {
    for (const rec of s.candidateRecordIds ?? []) {
      candidateIds.add(rec);
      const viaSoutenance = soutenanceToCommande.get(rec);
      if (viaSoutenance) candidateIds.add(viaSoutenance);
    }
  }
  const enrollmentByRecordId = new Map<string, string>();
  const idList = [...candidateIds];
  for (let i = 0; i < idList.length; i += 500) {
    const { data: exact, error: xe } = await admin
      .from("enrollments_ro")
      .select("id, airtable_record_id")
      .eq("org_id", orgId)
      .in("airtable_record_id", idList.slice(i, i + 500));
    if (xe) throw new Error(`fillout enrollments by record: ${xe.message}`);
    for (const e of exact ?? []) enrollmentByRecordId.set(e.airtable_record_id as string, e.id as string);
  }

  // Repli : e-mail -> (learner, dossier le plus récent) en 2 requêtes.
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
    const candidates = s.candidateRecordIds ?? [];
    if (candidates.length === 0 && !s.email) {
      stats.skippedNoEmail++;
      continue;
    }
    // 1) candidat = Commande directe ; 2) candidat = Soutenance → Commande ;
    // 3) repli e-mail → dossier le plus récent.
    let enrollmentId: string | undefined;
    for (const rec of candidates) {
      enrollmentId = enrollmentByRecordId.get(rec);
      if (enrollmentId) {
        stats.matchedByRecordId++;
        break;
      }
      const commande = soutenanceToCommande.get(rec);
      enrollmentId = commande ? enrollmentByRecordId.get(commande) : undefined;
      if (enrollmentId) {
        stats.matchedViaSoutenance++;
        break;
      }
    }
    if (!enrollmentId && s.email) {
      const learnerId = learnerByEmail.get(s.email);
      enrollmentId = learnerId ? enrollmentByLearner.get(learnerId) : undefined;
    }
    if (!enrollmentId) {
      stats.skippedUnknownEmail++;
      continue;
    }
    rows.push({
      org_id: orgId,
      enrollment_id: enrollmentId,
      source: "fillout",
      fillout_submission_id: s.submissionId,
      session_date: s.sessionDate ?? (s.submittedAt?.slice(0, 10) || null),
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
