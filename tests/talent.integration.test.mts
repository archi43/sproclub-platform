/**
 * Vivier de talents (INC-17) — intégration contre la vraie base, orgs jetables.
 * Prouve le modèle de confidentialité :
 *   1. un partenaire ne voit QUE les candidats consentants, en synthèse
 *      chiffrée (vue talent_pool), avec les métriques réelles ;
 *   2. la révocation retire immédiatement le candidat ;
 *   3. isolation : rien inter-org, rien sur les tables sous-jacentes, aucune
 *      écriture partenaire ;
 *   4. le statut vivier (staff_status) est verrouillé contre l'apprenant
 *      (trigger) et posé par la coordination ;
 *   5. un effacé RGPD disparaît de la vue même si sa ligne de consentement
 *      subsiste (ceinture data_erasures).
 * Skips without Supabase env.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const configured = !!url && !!anon && !!serviceKey && !url.includes("placeholder") && !serviceKey.includes("placeholder");
const skip = !configured && "Supabase env not configured";

const runId = `talent-${Date.now()}`;
const pwd = "Test-Password-123!";
let admin: SupabaseClient;
const org: Record<string, string> = {};
const users: Record<string, { id: string; email: string }> = {};
const clients: Record<string, SupabaseClient> = {};
let companyId = "";
let aliceLearnerId = "";
let bobLearnerId = "";
let erasedLearnerId = "";

async function makeOrg(tag: string): Promise<string> {
  const { data } = await admin.from("organizations").insert({ slug: `${runId}-${tag}`, name: `Org ${tag}` }).select("id").single();
  org[tag] = data!.id as string;
  return org[tag];
}

async function makeAuthUser(tag: string, orgId: string, role: string, extra: Record<string, unknown> = {}, emailOverride?: string): Promise<void> {
  const email = (emailOverride ?? `${runId}-${tag}@ex.test`).toLowerCase();
  const { data } = await admin.auth.admin.createUser({ email, password: pwd, email_confirm: true, app_metadata: { org_id: orgId } });
  const id = data!.user!.id;
  await admin.from("profiles").insert({ id, email });
  await admin.from("memberships").insert({ org_id: orgId, profile_id: id, role, ...extra });
  users[tag] = { id, email };
  const c = createClient(url!, anon!, { auth: { persistSession: false } });
  const { error } = await c.auth.signInWithPassword({ email, password: pwd });
  assert.ok(!error, `sign in ${tag}: ${error?.message}`);
  clients[tag] = c;
}

async function makeLearner(tag: string, orgId: string, email: string, enrollment: Record<string, unknown>): Promise<string> {
  const { data: learner, error } = await admin
    .from("learners_ro")
    .insert({ org_id: orgId, email, airtable_record_id: `${runId}-etu-${tag}`, unique_learner_id: `${runId}-${tag}`, first_name: tag, last_name: "Talent" })
    .select("id")
    .single();
  assert.ok(!error, `learner ${tag}: ${error?.message}`);
  const learnerId = learner!.id as string;
  const { error: ee } = await admin
    .from("enrollments_ro")
    .insert({ org_id: orgId, learner_id: learnerId, airtable_record_id: `${runId}-cmd-${tag}`, ...enrollment });
  assert.ok(!ee, `enrollment ${tag}: ${ee?.message}`);
  return learnerId;
}

before(async () => {
  if (!configured) return;
  admin = createClient(url!, serviceKey!, { auth: { persistSession: false } });
  const a = await makeOrg("a");
  const b = await makeOrg("b");

  const { data: comp } = await admin.from("partner_companies").insert({ org_id: a, name: `Entreprise ${runId}` }).select("id").single();
  companyId = comp!.id as string;
  const { data: compB } = await admin.from("partner_companies").insert({ org_id: b, name: `Entreprise B ${runId}` }).select("id").single();

  await makeAuthUser("dir", a, "direction");
  await makeAuthUser("partner", a, "partner", { partner_company_id: companyId });
  await makeAuthUser("partnerB", b, "partner", { partner_company_id: compB!.id as string });

  // Apprenants : alice (consentira), bob (jamais), erased (consent puis effacement).
  aliceLearnerId = await makeLearner("alice", a, `${runId}-alice@ex.test`, {
    program: "Consultant SAP", specialty: "MM", status: "En cours",
    progress: 80, projects_validated: 4, projects_required: 8, late_days: 0,
    start_date: "2026-02-01", end_date: "2026-11-30",
  });
  bobLearnerId = await makeLearner("bob", a, `${runId}-bob@ex.test`, { program: "Consultant SAP", status: "En cours", start_date: "2026-02-01" });
  erasedLearnerId = await makeLearner("erased", a, `${runId}-erased@ex.test`, { program: "Consultant SAP", status: "Terminé", start_date: "2025-01-01" });

  // Résultats jury d'alice (synthèse chiffrée que verra le partenaire).
  const { data: enr } = await admin.from("enrollments_ro").select("id").eq("airtable_record_id", `${runId}-cmd-alice`).single();
  await admin.from("project_deliverables").insert([
    { org_id: a, enrollment_id: enr!.id as string, project_number: 1, deliverable_submitted: true, validated_at: "2026-05-01T10:00:00Z", l360_score: 90, source: "l360" },
    { org_id: a, enrollment_id: enr!.id as string, project_number: 2, deliverable_submitted: true, validated_at: "2026-06-01T10:00:00Z", l360_score: 80, source: "l360" },
  ]);

  // Le compte étudiant d'alice (gère son consentement).
  await makeAuthUser("alice", a, "student", {}, `${runId}-alice@ex.test`);

  // Un créneau Cal.eu réel : prouve que le resserrage 0025 d'availabilities_read
  // bloque le partenaire sans casser la réservation étudiante.
  await admin.from("availabilities").insert({
    org_id: a, host_id: users.dir.id, kind: "coaching",
    starts_at: "2026-09-01T09:00:00Z", ends_at: "2026-09-01T10:00:00Z", calcom_ref: `cal:${runId}`,
  });
});

after(async () => {
  if (!configured) return;
  for (const o of Object.values(org)) {
    await admin.from("availabilities").delete().eq("org_id", o);
    await admin.from("talent_profiles").delete().eq("org_id", o);
    await admin.from("project_deliverables").delete().eq("org_id", o);
    await admin.from("data_erasures").delete().eq("org_id", o);
    await admin.from("enrollments_ro").delete().eq("org_id", o);
    await admin.from("learners_ro").delete().eq("org_id", o);
    await admin.from("memberships").delete().eq("org_id", o);
    await admin.from("partner_companies").delete().eq("org_id", o);
    await admin.from("organizations").delete().eq("id", o);
  }
  for (const u of Object.values(users)) {
    await admin.from("profiles").delete().eq("id", u.id);
    await admin.auth.admin.deleteUser(u.id);
  }
});

test("sans consentement, le vivier partenaire est vide", { skip }, async () => {
  const { data, error } = await clients.partner.from("talent_pool").select("learner_id");
  assert.ok(!error, error?.message);
  assert.equal(data!.length, 0, "aucun candidat avant consentement");
});

test("le consentement de l'apprenant le rend visible, en synthèse chiffrée exacte", { skip }, async () => {
  // Alice consent depuis SON compte (policy student_manage).
  const { error: consentErr } = await clients.alice.from("talent_profiles").insert({
    org_id: org.a,
    learner_id: aliceLearnerId,
    consented_at: new Date().toISOString(),
    available_from: "2026-12-01",
    contract_sought: "CDI",
    mobility: "Full remote",
  });
  assert.ok(!consentErr, `consent: ${consentErr?.message}`);

  const { data } = await clients.partner.from("talent_pool").select("*");
  assert.equal(data!.length, 1, "seule alice (consentante) apparaît — jamais bob");
  const row = data![0];
  assert.equal(row.first_name, "alice");
  assert.equal(row.progress, 80);
  assert.equal(row.projects_validated, 4);
  assert.equal(row.projects_required, 8);
  assert.equal(Number(row.jury_avg_score), 85, "moyenne jury (90+80)/2");
  assert.equal(row.jury_validated_count, 2);
  assert.equal(row.contract_sought, "CDI");
});

test("la révocation retire immédiatement le candidat", { skip }, async () => {
  const { error } = await clients.alice.from("talent_profiles").update({ revoked_at: new Date().toISOString() }).eq("learner_id", aliceLearnerId);
  assert.ok(!error, error?.message);
  const { data } = await clients.partner.from("talent_pool").select("learner_id");
  assert.equal(data!.length, 0, "plus aucun candidat après révocation");
  // Re-consentir pour la suite.
  await clients.alice.from("talent_profiles").update({ revoked_at: null }).eq("learner_id", aliceLearnerId);
});

test("isolation : rien inter-org, rien sur les tables sous-jacentes, aucune écriture partenaire", { skip }, async () => {
  const foreign = await clients.partnerB.from("talent_pool").select("learner_id");
  assert.equal(foreign.data?.length ?? 0, 0, "le partenaire d'une autre org ne voit rien");

  const learners = await clients.partner.from("learners_ro").select("id", { count: "exact", head: true });
  assert.equal(learners.count ?? 0, 0, "aucun accès direct aux apprenants");
  const profiles = await clients.partner.from("talent_profiles").select("id", { count: "exact", head: true });
  assert.equal(profiles.count ?? 0, 0, "aucun accès direct aux profils vivier");
  const deliverables = await clients.partner.from("project_deliverables").select("id", { count: "exact", head: true });
  assert.equal(deliverables.count ?? 0, 0, "aucun accès direct aux livrables");
  const reports = await clients.partner.from("coaching_reports").select("id", { count: "exact", head: true });
  assert.equal(reports.count ?? 0, 0, "JAMAIS les comptes rendus (commentaires internes)");
  const slots = await clients.partner.from("availabilities").select("id", { count: "exact", head: true });
  assert.equal(slots.count ?? 0, 0, "pas d'accès aux créneaux Cal.eu (moindre privilège, 0025)");
  const studentSlots = await clients.alice.from("availabilities").select("id", { count: "exact", head: true });
  assert.ok((studentSlots.count ?? 0) >= 1, "l'étudiant, lui, voit toujours les créneaux (réservation intacte)");

  const write = await clients.partner.from("talent_profiles").insert({ org_id: org.a, learner_id: bobLearnerId, consented_at: new Date().toISOString() });
  assert.ok(write.error, "un partenaire ne peut pas forger un consentement");
  const company = await clients.partner.from("partner_companies").select("name");
  assert.equal(company.data?.length, 1, "le partenaire lit SA société (et elle seule)");
});

test("le statut vivier est verrouillé contre l'apprenant et posé par la coordination", { skip }, async () => {
  const forged = await clients.alice.from("talent_profiles").update({ staff_status: "searching" }).eq("learner_id", aliceLearnerId);
  assert.ok(forged.error, "l'apprenant ne peut pas poser son propre statut vivier (trigger)");

  const { error: staffErr } = await clients.dir.from("talent_profiles").update({ staff_status: "searching" }).eq("learner_id", aliceLearnerId);
  assert.ok(!staffErr, `la coordination pose le statut: ${staffErr?.message}`);

  const { data } = await clients.partner.from("talent_pool").select("staff_status").eq("learner_id", aliceLearnerId).single();
  assert.equal(data!.staff_status, "searching", "le partenaire voit le statut posé par la coordination");
});

test("revue sécurité : un rôle partner SANS société ne voit rien ; société inter-org refusée", { skip }, async () => {
  // Rôle partner accordé sans rattachement (le flux générique est bloqué côté
  // action, mais la vue doit tenir toute seule — défense en profondeur).
  await makeAuthUser("rogue", org.a, "partner");
  const { data } = await clients.rogue.from("talent_pool").select("learner_id");
  assert.equal(data?.length ?? 0, 0, "sans partner_company_id, la vue ne rend rien");

  // Cohérence de tenant : société de l'org B sur un membership de l'org A → trigger.
  const { data: compB } = await admin.from("partner_companies").select("id").eq("org_id", org.b).single();
  const cross = await admin.from("memberships").insert({
    org_id: org.a, profile_id: users.rogue.id, role: "evaluator", partner_company_id: compB!.id as string,
  });
  assert.ok(cross.error, "société d'un autre organisme (ou rôle non-partner) refusée par le trigger");
});

test("revue sécurité : un partner ne lit pas l'annuaire des profils, et sa consultation est journalisée", { skip }, async () => {
  const { data: profs } = await clients.partner.from("profiles").select("id, email");
  const others = (profs ?? []).filter((p) => p.id !== users.partner.id);
  assert.equal(others.length, 0, "aucun profil tiers (e-mails verrouillés — profiles_org_read resserrée)");

  // Accountability RGPD : la consultation du vivier laisse une trace d'audit.
  const { error: logErr } = await clients.partner.rpc("log_access", {
    p_action: "talent_pool.view",
    p_subject_type: "talent_pool",
    p_subject_id: null,
    p_detail: null,
  });
  assert.ok(!logErr, `log_access partner: ${logErr?.message}`);
  const { data: audit } = await admin
    .from("audit_log")
    .select("action, actor_id")
    .eq("org_id", org.a)
    .eq("action", "talent_pool.view");
  assert.ok(audit!.some((a) => a.actor_id === users.partner.id), "la consultation partner est tracée dans audit_log");
});

test("un effacé RGPD disparaît de la vue même si sa ligne de consentement subsiste", { skip }, async () => {
  const erasedEmail = `${runId}-erased@ex.test`;
  await admin.from("talent_profiles").insert({ org_id: org.a, learner_id: erasedLearnerId, consented_at: new Date().toISOString() });
  const beforeErase = await clients.partner.from("talent_pool").select("learner_id");
  assert.equal(beforeErase.data!.length, 2, "les deux consentants sont visibles avant effacement");

  await admin.from("data_erasures").insert({ org_id: org.a, learner_email: erasedEmail });
  const afterErase = await clients.partner.from("talent_pool").select("learner_id");
  assert.equal(afterErase.data!.length, 1, "l'effacé RGPD n'apparaît plus dans le vivier");
  assert.equal(afterErase.data![0].learner_id, aliceLearnerId);
});
