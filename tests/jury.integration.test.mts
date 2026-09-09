/**
 * Notation par le jury (INC-28) — intégration contre la vraie base, orgs jetables.
 *
 * Ce que ces tests prouvent, et qu'aucun test unitaire ne peut prouver :
 *   1. un évaluateur ne note QUE les soutenances où il siège ;
 *   2. il ne peut pas signer au nom d'un autre ;
 *   3. deux membres d'un même jury ne se lisent pas — leurs avis restent indépendants ;
 *   4. il ne voit du dossier et de l'apprenant que ce que sa soutenance justifie ;
 *   5. une seule note par évaluateur et par soutenance (un double envoi corrige) ;
 *   6. isolation inter-organismes.
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

const runId = `jury-${Date.now()}`;
const pwd = "Test-Password-123!";
let admin: SupabaseClient;
const org: Record<string, string> = {};
const users: Record<string, { id: string; email: string }> = {};
const clients: Record<string, SupabaseClient> = {};
const ids: Record<string, string> = {};

async function makeOrg(tag: string): Promise<string> {
  const { data } = await admin.from("organizations").insert({ slug: `${runId}-${tag}`, name: `Org ${tag}` }).select("id").single();
  org[tag] = data!.id as string;
  return org[tag];
}

async function makeAuthUser(tag: string, orgId: string, role: string): Promise<void> {
  const email = `${runId}-${tag}@ex.test`.toLowerCase();
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

/** Un dossier et sa soutenance passée, prêts à être notés. */
async function makeDefense(orgId: string, tag: string, evaluatorTags: string[]): Promise<void> {
  const email = `${runId}-${tag}-learner@ex.test`;
  const { data: le } = await admin.from("learners_ro")
    .insert({ org_id: orgId, airtable_record_id: `${runId}-${tag}-l`, unique_learner_id: email, email, first_name: "App", last_name: tag.toUpperCase() })
    .select("id").single();
  const { data: en } = await admin.from("enrollments_ro")
    .insert({ org_id: orgId, airtable_record_id: `${runId}-${tag}-e`, learner_id: le!.id, program: "Programme test", status: "En cours" })
    .select("id").single();
  await admin.from("project_deliverables")
    .insert({ org_id: orgId, enrollment_id: en!.id, project_number: 1, deliverable_submitted: true });
  const past = new Date(Date.now() - 86400000).toISOString();
  const { data: rv } = await admin.from("reservations")
    .insert({ org_id: orgId, learner_id: le!.id, enrollment_id: en!.id, kind: "defense", project_number: 1,
              starts_at: past, ends_at: new Date(Date.parse(past) + 3600000).toISOString(), status: "confirmed" })
    .select("id").single();
  ids[`${tag}Learner`] = le!.id;
  ids[`${tag}Enrollment`] = en!.id;
  ids[`${tag}Reservation`] = rv!.id;
  for (const t of evaluatorTags) {
    // Invariant de 0004 : un évaluateur doit appartenir au vivier du programme.
    // L'oublier fait échouer l'affectation en silence — et rendait mes tests
    // négatifs verts pour la mauvaise raison : personne n'était affecté.
    await admin.from("evaluator_pool")
      .upsert({ org_id: orgId, program: "Programme test", evaluator_id: users[t].id }, { onConflict: "program,evaluator_id" });
    const { error } = await admin.from("reservation_evaluators")
      .insert({ org_id: orgId, reservation_id: rv!.id, evaluator_id: users[t].id });
    assert.ok(!error, `affectation de ${t} refusée : ${error?.message}`);
  }
}

before(async () => {
  if (!configured) return;
  admin = createClient(url!, serviceKey!, { auth: { persistSession: false } });
  const a = await makeOrg("a");
  const b = await makeOrg("b");
  await makeAuthUser("evalA1", a, "evaluator");   // siège au jury A
  await makeAuthUser("evalA2", a, "evaluator");   // siège au même jury A
  await makeAuthUser("evalOut", a, "evaluator");  // évaluateur de l'org, hors de ce jury
  await makeAuthUser("evalB", b, "evaluator");    // autre organisme
  await makeDefense(a, "a", ["evalA1", "evalA2"]);
  await makeDefense(b, "b", ["evalB"]);
});

after(async () => {
  if (!configured) return;
  for (const t of ["a", "b"]) {
    await admin.from("coaching_reports").delete().eq("org_id", org[t]);
    await admin.from("reservation_evaluators").delete().eq("org_id", org[t]);
    await admin.from("evaluator_pool").delete().eq("org_id", org[t]);
    await admin.from("reservations").delete().eq("org_id", org[t]);
    await admin.from("project_deliverables").delete().eq("org_id", org[t]);
    await admin.from("enrollments_ro").delete().eq("org_id", org[t]);
    await admin.from("learners_ro").delete().eq("org_id", org[t]);
    await admin.from("memberships").delete().eq("org_id", org[t]);
  }
  for (const u of Object.values(users)) {
    await admin.from("profiles").delete().eq("id", u.id);
    await admin.auth.admin.deleteUser(u.id);
  }
  for (const t of ["a", "b"]) await admin.from("organizations").delete().eq("id", org[t]);
});

const evaluation = (tag: string, grade: number, body: string) => ({
  org_id: org.a,
  enrollment_id: ids.aEnrollment,
  reservation_id: ids.aReservation,
  author_id: users[tag].id,
  session_date: new Date().toISOString().slice(0, 10),
  grade,
  body,
  source: "platform",
});

test("un membre du jury dépose son appréciation", { skip }, async () => {
  const { error } = await clients.evalA1.from("coaching_reports").insert(evaluation("evalA1", 3, "Prestation solide."));
  assert.ok(!error, `dépôt refusé : ${error?.message}`);
});

test("un évaluateur de l'organisme, hors de ce jury, ne peut pas noter", { skip }, async () => {
  // C'est l'invariant central : être évaluateur ne suffit pas, il faut siéger.
  const { error } = await clients.evalOut.from("coaching_reports")
    .insert({ ...evaluation("evalOut", 4, "Je n'y étais pas.") });
  assert.ok(error, "une note hors jury a été acceptée");
});

test("on ne signe pas au nom d'un autre", { skip }, async () => {
  const { error } = await clients.evalA2.from("coaching_reports")
    .insert({ ...evaluation("evalA2", 2, "Signée par quelqu'un d'autre."), author_id: users.evalA1.id });
  assert.ok(error, "usurpation d'auteur acceptée");
});

test("deux membres du même jury ne se lisent pas", { skip }, async () => {
  await clients.evalA2.from("coaching_reports").insert(evaluation("evalA2", 2, "Des lacunes sur le paramétrage."));
  const { data } = await clients.evalA2.from("coaching_reports").select("author_id, grade").eq("org_id", org.a);
  assert.equal(data?.length, 1, "evalA2 doit ne voir que sa propre appréciation");
  assert.equal(data?.[0].author_id, users.evalA2.id);
  // Contrôle croisé côté service-role : les deux notes existent bien.
  const { count } = await admin.from("coaching_reports").select("*", { count: "exact", head: true }).eq("reservation_id", ids.aReservation);
  assert.equal(count, 2, "les deux appréciations doivent coexister en base");
});

test("une seule note par évaluateur : un second envoi corrige", { skip }, async () => {
  const { error } = await clients.evalA1.from("coaching_reports")
    .upsert(evaluation("evalA1", 4, "Après relecture du livrable, note relevée."), { onConflict: "reservation_id,author_id" });
  assert.ok(!error, `correction refusée : ${error?.message}`);
  const { data } = await admin.from("coaching_reports")
    .select("grade").eq("reservation_id", ids.aReservation).eq("author_id", users.evalA1.id);
  assert.equal(data?.length, 1, "la correction ne doit pas créer une seconde note");
  assert.equal(Number(data?.[0].grade), 4);
});

test("le jury voit le dossier et l'apprenant qu'il évalue, et rien de plus", { skip }, async () => {
  const { data: enr } = await clients.evalA1.from("enrollments_ro").select("id").eq("org_id", org.a);
  assert.equal(enr?.length, 1, "seul le dossier de sa soutenance");
  assert.equal(enr?.[0].id, ids.aEnrollment);

  const { data: lea } = await clients.evalA1.from("learners_ro").select("id").eq("org_id", org.a);
  assert.equal(lea?.length, 1, "seul l'apprenant de sa soutenance");

  // L'évaluateur non affecté ne voit ni le dossier ni l'apprenant.
  const { data: enrOut } = await clients.evalOut.from("enrollments_ro").select("id").eq("org_id", org.a);
  assert.equal(enrOut?.length ?? 0, 0);
});

test("un évaluateur ne voit que les réservations de ses jurys", { skip }, async () => {
  const { data: mine } = await clients.evalA1.from("reservations").select("id").eq("org_id", org.a);
  assert.equal(mine?.length, 1);
  const { data: none } = await clients.evalOut.from("reservations").select("id").eq("org_id", org.a);
  assert.equal(none?.length ?? 0, 0, "un évaluateur hors jury ne voit aucune réservation");
});

test("isolation inter-organismes", { skip }, async () => {
  const { data } = await clients.evalB.from("reservations").select("id").eq("org_id", org.a);
  assert.equal(data?.length ?? 0, 0, "fuite inter-organismes");

  const { error } = await clients.evalB.from("coaching_reports").insert(evaluation("evalB", 4, "Autre organisme."));
  assert.ok(error, "un évaluateur d'un autre organisme a pu noter");
});
