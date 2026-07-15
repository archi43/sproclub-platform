/**
 * Pont 360Learning (INC-15) — test d'intégration contre la vraie base, org
 * jetable, client 360L FACTICE (l'API réelle n'est jamais contactée). Prouve :
 *   1. le reflet dépôt/validation JURY dans project_deliverables (le dépôt
 *      débloque la soutenance ; la validation pose validated_at + score) ;
 *   2. l'idempotence (re-run → aucun doublon, mêmes valeurs) ;
 *   3. la liste de suppression RGPD (un effacé n'est jamais réimporté) et le
 *      comptage explicite des e-mails inconnus (pas de perte silencieuse) ;
 *   4. la RLS de l360_path_mappings (lecture staff, rien pour student/coach,
 *      aucune écriture cliente).
 * Skips without Supabase env.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { syncL360 } from "../src/lib/l360/sync.ts";
import type { L360Client } from "../src/lib/l360/client.ts";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const configured = !!url && !!anon && !!serviceKey && !url.includes("placeholder") && !serviceKey.includes("placeholder");
const skip = !configured && "Supabase env not configured";

const runId = `l360-${Date.now()}`;
const pwd = "Test-Password-123!";
let admin: SupabaseClient;
let orgId = "";
const users: Record<string, { id: string; email: string }> = {};
const clients: Record<string, SupabaseClient> = {};
const enrollmentByEmail = new Map<string, string>();

const EMAILS = {
  alice: `${runId}-alice@ex.test`,
  bob: `${runId}-bob@ex.test`,
  carl: `${runId}-carl@ex.test`,
  erased: `${runId}-erased@ex.test`,
};

/** Client 360L factice reproduisant les formes RÉELLES observées sur l'instance. */
const fake: L360Client = {
  async listPaths() {
    return [
      // Parcours projet : 2 cours, le dernier (c2) est le cours de rendu.
      { id: "p3", name: "Projet n°3: rédiger une spécification fonctionnelle", steps: [{ id: "c1", type: "course" }, { id: "c2", type: "course" }] },
      // Regroupement : ne doit PAS devenir un mapping.
      { id: "grp", name: "Devenir consultant SAP digital - FI Projets 6, 7 & 8", steps: [{ id: "px", type: "path" }] },
    ];
  },
  async listPathStats(pathId) {
    if (pathId !== "p3") return [];
    return [
      // alice : validée par le jury (parcours successful).
      { userId: "u-alice", pathId, statusType: "successful", progress: 100, score: 92, enrolledAt: "2026-05-01T00:00:00Z", completedAt: "2026-06-01T10:00:00Z" },
      // bob : dépôt fait (cours de rendu clôturé), correction jury en attente.
      { userId: "u-bob", pathId, statusType: "onTime", progress: 97, score: 40, enrolledAt: "2026-05-01T00:00:00Z", completedAt: null },
      // carl : en cours, rien déposé.
      { userId: "u-carl", pathId, statusType: "onTime", progress: 10, score: null, enrolledAt: "2026-05-01T00:00:00Z", completedAt: null },
      // effacé RGPD : validé côté 360L mais ne doit JAMAIS revenir.
      { userId: "u-erased", pathId, statusType: "successful", progress: 100, score: 88, enrolledAt: "2026-05-01T00:00:00Z", completedAt: "2026-06-02T10:00:00Z" },
      // inconnu de la plateforme : compté, pas perdu en silence.
      { userId: "u-ghost", pathId, statusType: "successful", progress: 100, score: 70, enrolledAt: "2026-05-01T00:00:00Z", completedAt: "2026-06-03T10:00:00Z" },
    ];
  },
  async listCourseStats(courseId) {
    if (courseId !== "c2") return [];
    return [
      { userId: "u-alice", courseId, completedAt: "2026-05-20T09:00:00Z" },
      { userId: "u-bob", courseId, completedAt: "2026-06-10T08:00:00Z" },
      // carl a ouvert le cours sans le clôturer.
      { userId: "u-carl", courseId, completedAt: null },
    ];
  },
  async listUsers() {
    return [
      { id: "u-alice", email: EMAILS.alice },
      { id: "u-bob", email: EMAILS.bob },
      { id: "u-carl", email: EMAILS.carl },
      { id: "u-erased", email: EMAILS.erased },
      { id: "u-ghost", email: `${runId}-ghost@ex.test` },
    ];
  },
};

async function makeAuthUser(tag: string, role: string, emailOverride?: string): Promise<void> {
  const email = (emailOverride ?? `${runId}-${tag}@auth.test`).toLowerCase();
  const { data } = await admin.auth.admin.createUser({ email, password: pwd, email_confirm: true, app_metadata: { org_id: orgId } });
  const id = data!.user!.id;
  await admin.from("profiles").insert({ id, email });
  await admin.from("memberships").insert({ org_id: orgId, profile_id: id, role });
  users[tag] = { id, email };
  const c = createClient(url!, anon!, { auth: { persistSession: false } });
  const { error } = await c.auth.signInWithPassword({ email, password: pwd });
  assert.ok(!error, `sign in ${tag}: ${error?.message}`);
  clients[tag] = c;
}

before(async () => {
  if (!configured) return;
  admin = createClient(url!, serviceKey!, { auth: { persistSession: false } });
  const { data: org } = await admin.from("organizations").insert({ slug: runId, name: `Org ${runId}` }).select("id").single();
  orgId = org!.id as string;

  // Apprenants + dossiers (sauf ghost, volontairement inconnu de la plateforme).
  for (const [tag, email] of Object.entries(EMAILS)) {
    const { data: learner } = await admin
      .from("learners_ro")
      .insert({ org_id: orgId, email, airtable_record_id: `${runId}-etu-${tag}`, unique_learner_id: `${runId}-${tag}` })
      .select("id")
      .single();
    const { data: enr } = await admin
      .from("enrollments_ro")
      .insert({ org_id: orgId, learner_id: learner!.id as string, airtable_record_id: `${runId}-${tag}`, program: "Consultant SAP", status: "En cours", start_date: "2026-04-01" })
      .select("id")
      .single();
    enrollmentByEmail.set(email, enr!.id as string);
  }
  // Liste de suppression RGPD : l'effacé ne doit jamais être réimporté.
  await admin.from("data_erasures").insert({ org_id: orgId, learner_email: EMAILS.erased });

  await makeAuthUser("dir", "direction");
  await makeAuthUser("stud", "student");
  // alice possède un compte plateforme avec l'e-mail de son dossier : c'est le
  // cas réel visé par la policy student (0004) + le garde-fou 0023.
  await makeAuthUser("alice", "student", EMAILS.alice);
});

after(async () => {
  if (!configured || !orgId) return;
  await admin.from("project_deliverables").delete().eq("org_id", orgId);
  await admin.from("l360_path_mappings").delete().eq("org_id", orgId);
  await admin.from("data_erasures").delete().eq("org_id", orgId);
  await admin.from("enrollments_ro").delete().eq("org_id", orgId);
  await admin.from("learners_ro").delete().eq("org_id", orgId);
  await admin.from("organizations").delete().eq("id", orgId);
  for (const u of Object.values(users)) {
    await admin.from("profiles").delete().eq("id", u.id);
    await admin.auth.admin.deleteUser(u.id);
  }
});

test("la sync reflète dépôt et validation jury, skip-list RGPD comprise", { skip }, async () => {
  const stats = await syncL360(admin, orgId, fake);

  assert.equal(stats.mappingsDiscovered, 1, "seul « Projet n°3 » devient un mapping (pas le regroupement)");
  assert.equal(stats.skippedErased, 1, "l'effacé RGPD est écarté et compté");
  assert.equal(stats.skippedUnknownEmail, 1, "l'inconnu est écarté et compté (pas de perte silencieuse)");
  assert.equal(stats.submitted, 2, "alice + bob écrits");
  assert.equal(stats.validated, 1, "seule alice est validée par le jury");

  const { data: rows } = await admin
    .from("project_deliverables")
    .select("enrollment_id, project_number, deliverable_submitted, submitted_at, validated_at, l360_score, source")
    .eq("org_id", orgId);
  assert.equal(rows!.length, 2, "aucune ligne pour carl (rien déposé), l'effacé ni l'inconnu");

  const alice = rows!.find((r) => r.enrollment_id === enrollmentByEmail.get(EMAILS.alice))!;
  assert.equal(alice.project_number, 3);
  assert.equal(alice.deliverable_submitted, true);
  assert.equal(alice.submitted_at, "2026-05-20T09:00:00+00:00", "date de dépôt = clôture du cours de rendu");
  assert.equal(alice.validated_at, "2026-06-01T10:00:00+00:00", "date de validation = clôture du parcours");
  assert.equal(alice.l360_score, 92);
  assert.equal(alice.source, "l360");

  const bob = rows!.find((r) => r.enrollment_id === enrollmentByEmail.get(EMAILS.bob))!;
  assert.equal(bob.deliverable_submitted, true, "le dépôt de bob débloque sa soutenance");
  assert.equal(bob.validated_at, null, "bob n'est pas encore validé par le jury");
  assert.equal(bob.l360_score, null, "pas de score tant que le jury n'a pas corrigé");
});

test("re-run idempotent : aucun doublon, aucune découverte en double", { skip }, async () => {
  const stats = await syncL360(admin, orgId, fake);
  assert.equal(stats.mappingsDiscovered, 0, "le mapping existant n'est pas recréé");
  const { count } = await admin.from("project_deliverables").select("id", { count: "exact", head: true }).eq("org_id", orgId);
  assert.equal(count, 2, "toujours 2 lignes après re-run");
});

test("RLS l360_path_mappings : lecture staff, rien pour un étudiant, écriture refusée", { skip }, async () => {
  // current_org_id() retombe sur le claim JWT app_metadata.org_id posé à la création.
  const dir = await clients.dir.from("l360_path_mappings").select("id", { count: "exact", head: true }).eq("org_id", orgId);
  assert.ok((dir.count ?? 0) >= 1, "la direction lit les mappings de son org");

  const stud = await clients.stud.from("l360_path_mappings").select("id", { count: "exact", head: true }).eq("org_id", orgId);
  assert.equal(stud.count ?? 0, 0, "un étudiant ne voit aucun mapping");

  const write = await clients.dir.from("l360_path_mappings").insert({ org_id: orgId, l360_path_id: "forge", project_number: 9 });
  assert.ok(write.error, "aucune écriture cliente (service-role uniquement)");
});

test("garde-fou 0023 : l'étudiant ne peut pas réécrire un livrable validé par le jury", { skip }, async () => {
  const aliceEnrollment = enrollmentByEmail.get(EMAILS.alice)!;

  // Sa propre ligne, dans le périmètre de la policy student — mais gérée par
  // 360L et validée par le jury : le trigger doit refuser la réécriture.
  const { data: updated, error } = await clients.alice
    .from("project_deliverables")
    .update({ deliverable_url: "https://exemple.test/forge", submitted_at: new Date().toISOString() })
    .eq("org_id", orgId)
    .eq("enrollment_id", aliceEnrollment)
    .select("id");
  assert.ok(error, "la réécriture d'un livrable validé est refusée par le trigger");
  assert.equal(updated, null);

  const { data: row } = await admin
    .from("project_deliverables")
    .select("deliverable_url, validated_at, l360_score")
    .eq("org_id", orgId)
    .eq("enrollment_id", aliceEnrollment)
    .single();
  assert.equal(row!.deliverable_url, null, "l'URL n'a pas été altérée");
  assert.equal(row!.l360_score, 92, "le score jury est intact");
});
