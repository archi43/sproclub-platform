// NB: pas de "server-only" ici — importé par les tests Node (client 360L factice
// injecté). Ne jamais importer depuis un composant client.
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  decideDeliverableState,
  extractProjectNumber,
  latestStatPerUser,
  pickDepositCourseId,
} from "@/lib/l360-rules";
import type { L360Client } from "@/lib/l360/client";

/**
 * 360Learning → Postgres (INC-15). Reflète l'état des livrables de projet :
 * dépôt (tentative clôturée sur le cours de rendu) et validation par le JURY
 * (parcours « successful »). Idempotent : upsert sur (enrollment_id,
 * project_number), jamais de downgrade (on n'écrit que des dépôts avérés).
 * Auto-découverte des parcours « Projet n°X » dans l360_path_mappings
 * (insert-only : les ajustements manuels du staff restent autoritaires).
 * Runs with a trusted (service-role) client.
 */
export interface L360SyncStats {
  paths: number;
  mappingsDiscovered: number;
  mappingsActive: number;
  statRecords: number;
  skippedUnknownEmail: number;
  skippedErased: number;
  submitted: number;
  validated: number;
}

const CHUNK = 500;
function chunk<T>(a: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < a.length; i += n) out.push(a.slice(i, i + n));
  return out;
}

interface Mapping {
  l360_path_id: string;
  project_number: number;
  deposit_course_id: string | null;
}

interface DeliverableRow {
  org_id: string;
  enrollment_id: string;
  project_number: number;
  deliverable_submitted: true;
  submitted_at: string | null;
  validated_at: string | null;
  l360_score: number | null;
  source: "l360";
}

export async function syncL360(admin: SupabaseClient, orgId: string, l360: L360Client): Promise<L360SyncStats> {
  const stats: L360SyncStats = {
    paths: 0,
    mappingsDiscovered: 0,
    mappingsActive: 0,
    statRecords: 0,
    skippedUnknownEmail: 0,
    skippedErased: 0,
    submitted: 0,
    validated: 0,
  };

  // --- Pass 1 : auto-découverte des parcours « Projet n°X » -------------------
  const paths = await l360.listPaths();
  stats.paths = paths.length;
  const candidates = paths.flatMap((p) => {
    const projectNumber = extractProjectNumber(p.name);
    if (!projectNumber) return [];
    return [
      {
        org_id: orgId,
        l360_path_id: p.id,
        project_number: projectNumber,
        deposit_course_id: pickDepositCourseId(p.steps),
        path_name: p.name.trim(),
      },
    ];
  });
  if (candidates.length > 0) {
    // insert-only : un mapping existant (éventuellement corrigé à la main) n'est
    // jamais réécrit par la découverte.
    const { data, error } = await admin
      .from("l360_path_mappings")
      .upsert(candidates, { onConflict: "org_id,l360_path_id", ignoreDuplicates: true })
      .select("id");
    if (error) throw new Error(`l360 mappings upsert: ${error.message}`);
    stats.mappingsDiscovered = (data ?? []).length;
  }

  const { data: mappingRows, error: me } = await admin
    .from("l360_path_mappings")
    .select("l360_path_id, project_number, deposit_course_id")
    .eq("org_id", orgId)
    .eq("active", true);
  if (me) throw new Error(`l360 mappings read: ${me.message}`);
  const mappings = (mappingRows ?? []) as Mapping[];
  stats.mappingsActive = mappings.length;
  if (mappings.length === 0) return stats;

  // --- Pass 2 : états par (parcours, apprenant 360L) --------------------------
  interface Candidate {
    userId: string;
    projectNumber: number;
    submittedAt: string | null;
    validatedAt: string | null;
    score: number | null;
  }
  const submittedCandidates: Candidate[] = [];

  for (const mapping of mappings) {
    const pathStats = latestStatPerUser(await l360.listPathStats(mapping.l360_path_id));
    stats.statRecords += pathStats.length;

    // Dépôt : première tentative clôturée sur le cours de rendu, par apprenant.
    const depositByUser = new Map<string, string>();
    if (mapping.deposit_course_id) {
      for (const attempt of await l360.listCourseStats(mapping.deposit_course_id)) {
        if (!attempt.completedAt) continue;
        const current = depositByUser.get(attempt.userId);
        if (!current || attempt.completedAt < current) depositByUser.set(attempt.userId, attempt.completedAt);
      }
    }

    for (const stat of pathStats) {
      const state = decideDeliverableState({
        statusType: stat.statusType,
        pathCompletedAt: stat.completedAt,
        score: stat.score,
        depositCompletedAt: depositByUser.get(stat.userId) ?? null,
      });
      if (!state.submitted) continue;
      submittedCandidates.push({
        userId: stat.userId,
        projectNumber: mapping.project_number,
        submittedAt: state.submittedAt,
        validatedAt: state.validatedAt,
        score: state.score,
      });
    }
  }
  if (submittedCandidates.length === 0) return stats;

  // --- Pass 3 : jointure e-mail → apprenant → dossier le plus récent ----------
  const users = await l360.listUsers();
  const emailByUserId = new Map(users.filter((u) => u.email).map((u) => [u.id, u.email as string]));

  // Liste de suppression RGPD (INC-11) : ne jamais réimporter un effacé.
  const { data: erasures, error: ee } = await admin.from("data_erasures").select("learner_email").eq("org_id", orgId);
  if (ee) throw new Error(`l360 erasures read: ${ee.message}`);
  const erased = new Set((erasures ?? []).map((r) => (r as { learner_email: string }).learner_email));

  const emails = [...new Set(submittedCandidates.map((c) => emailByUserId.get(c.userId)).filter(Boolean))] as string[];
  const learnerByEmail = new Map<string, string>();
  for (const group of chunk(emails, CHUNK)) {
    const { data: learners, error: le } = await admin
      .from("learners_ro")
      .select("id, email")
      .eq("org_id", orgId)
      .in("email", group);
    if (le) throw new Error(`l360 learners lookup: ${le.message}`);
    for (const l of learners ?? []) learnerByEmail.set(l.email as string, l.id as string);
  }

  const enrollmentByLearner = new Map<string, string>();
  const learnerIds = [...learnerByEmail.values()];
  for (const group of chunk(learnerIds, CHUNK)) {
    const { data: enrollments, error: ene } = await admin
      .from("enrollments_ro")
      .select("id, learner_id, start_date")
      .eq("org_id", orgId)
      .in("learner_id", group)
      .order("start_date", { ascending: false, nullsFirst: false });
    if (ene) throw new Error(`l360 enrollments lookup: ${ene.message}`);
    for (const e of enrollments ?? []) {
      const lid = e.learner_id as string;
      if (!enrollmentByLearner.has(lid)) enrollmentByLearner.set(lid, e.id as string); // first = latest
    }
  }

  // --- Pass 4 : upsert des livrables (dédupliqué, la validation prime) --------
  const byKey = new Map<string, DeliverableRow>();
  for (const c of submittedCandidates) {
    const email = emailByUserId.get(c.userId);
    if (!email) {
      stats.skippedUnknownEmail++;
      continue;
    }
    if (erased.has(email)) {
      stats.skippedErased++;
      continue;
    }
    const learnerId = learnerByEmail.get(email);
    const enrollmentId = learnerId ? enrollmentByLearner.get(learnerId) : undefined;
    if (!enrollmentId) {
      stats.skippedUnknownEmail++;
      continue;
    }
    const row: DeliverableRow = {
      org_id: orgId,
      enrollment_id: enrollmentId,
      project_number: c.projectNumber,
      deliverable_submitted: true,
      submitted_at: c.submittedAt,
      validated_at: c.validatedAt,
      l360_score: c.score,
      source: "l360",
    };
    // Plusieurs parcours 360L peuvent porter le même n° de projet (variantes par
    // spécialité) : une seule ligne par (dossier, projet), la validée d'abord.
    const key = `${enrollmentId}:${c.projectNumber}`;
    const current = byKey.get(key);
    const wins = !current || (!current.validated_at && !!row.validated_at) ||
      (!!current.validated_at === !!row.validated_at && (row.submitted_at ?? "") > (current.submitted_at ?? ""));
    if (wins) byKey.set(key, row);
  }

  const rows = [...byKey.values()];
  for (const group of chunk(rows, CHUNK)) {
    const { error } = await admin
      .from("project_deliverables")
      .upsert(group, { onConflict: "enrollment_id,project_number" });
    if (error) throw new Error(`l360 deliverables upsert: ${error.message}`);
  }
  stats.submitted = rows.length;
  stats.validated = rows.filter((r) => r.validated_at).length;

  await admin.from("sync_log").insert({
    entity: "l360_projects",
    direction: "l360_to_pg",
    status: "ok",
    detail: JSON.stringify(stats),
  });
  return stats;
}
