/**
 * Accès aux ressources (INC-30) — intégration contre la vraie base, orgs jetables.
 *
 * Prouve, au niveau base (RLS + fonction SECURITY DEFINER) :
 *   1. l'apprenant ne lit que SES affectations, jamais celles d'un autre ni d'un
 *      autre organisme ; la coordination lit celles de son organisme ; le coach
 *      et l'anonyme ne lisent rien ;
 *   2. personne n'écrit dans la table hors service-role ;
 *   3. `reveal_resource_assignment` ne rend l'identifiant du compte (donc l'accès
 *      au mot de passe) qu'à l'apprenant propriétaire, pendant la période, et
 *      journalise chaque révélation — même un compte qui cumule apprenant et
 *      coordination n'obtient pas le secret d'un autre ;
 *   4. l'anonyme ne peut même pas exécuter la fonction (verrou EXECUTE, 0019).
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

const runId = `res-${Date.now()}`;
const pwd = "Test-Password-123!";
let admin: SupabaseClient;
const org: Record<string, string> = {};
const users: Record<string, { id: string; email: string }> = {};
const clients: Record<string, SupabaseClient> = {};
const enrollment: Record<string, string> = {};
const assignment: Record<string, string> = {};
const learner: Record<string, string> = {};

// Calendrier de Paris, comme la fonction en base.
const parisToday = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(new Date());
const shift = (days: number) => {
  const d = new Date(`${parisToday}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

async function makeOrg(tag: string): Promise<string> {
  const { data, error } = await admin.from("organizations").insert({ slug: `${runId}-${tag}`, name: `Org ${tag}` }).select("id").single();
  assert.ok(!error, `org ${tag}: ${error?.message}`);
  org[tag] = data!.id as string;
  return org[tag];
}

async function makeAuthUser(tag: string, orgId: string, roles: string[]): Promise<void> {
  const email = `${runId}-${tag}@ex.test`.toLowerCase();
  const { data, error } = await admin.auth.admin.createUser({ email, password: pwd, email_confirm: true, app_metadata: { org_id: orgId } });
  assert.ok(!error, `user ${tag}: ${error?.message}`);
  const id = data!.user!.id;
  const { error: pe } = await admin.from("profiles").insert({ id, email });
  assert.ok(!pe, `profile ${tag}: ${pe?.message}`);
  for (const role of roles) {
    const { error: me } = await admin.from("memberships").insert({ org_id: orgId, profile_id: id, role });
    assert.ok(!me, `membership ${tag}/${role}: ${me?.message}`);
  }
  users[tag] = { id, email };
  const c = createClient(url!, anon!, { auth: { persistSession: false } });
  const { error: se } = await c.auth.signInWithPassword({ email, password: pwd });
  assert.ok(!se, `sign in ${tag}: ${se?.message}`);
  clients[tag] = c;
}

async function makeLearner(tag: string, orgId: string): Promise<void> {
  const email = `${runId}-${tag}@ex.test`.toLowerCase();
  const { data, error } = await admin
    .from("learners_ro")
    .insert({ org_id: orgId, email, airtable_record_id: `${runId}-etu-${tag}`, unique_learner_id: `${runId}-${tag}`, first_name: tag })
    .select("id").single();
  assert.ok(!error, `learner ${tag}: ${error?.message}`);
  learner[tag] = data!.id as string;
  const { data: enr, error: ee } = await admin
    .from("enrollments_ro")
    .insert({ org_id: orgId, learner_id: learner[tag], airtable_record_id: `${runId}-cmd-${tag}`, program: "Consultant SAP", status: "En cours" })
    .select("id").single();
  assert.ok(!ee, `enrollment ${tag}: ${ee?.message}`);
  enrollment[tag] = enr!.id as string;
}

async function makeAssignment(tag: string, orgId: string, owner: string, startsOn: string | null, endsOn: string | null): Promise<void> {
  const { data, error } = await admin.from("resource_assignments").insert({
    org_id: orgId,
    enrollment_id: enrollment[owner],
    airtable_record_id: `${runId}-aff-${tag}`,
    airtable_resource_id: `recRes${tag.padEnd(11, "x").slice(0, 11)}`,
    resource_label: `P2W-${tag}`,
    resource_type: "Serveur SAP S/4HANA",
    resource_category: "Serveur SAP",
    starts_on: startsOn,
    ends_on: endsOn,
  }).select("id").single();
  // Une fixture qui échoue en silence rend les tests négatifs verts pour la
  // mauvaise raison (piège déjà rencontré sur le jury) : on échoue tout de suite.
  assert.ok(!error, `assignment ${tag}: ${error?.message}`);
  assignment[tag] = data!.id as string;
}

before(async () => {
  if (!configured) return;
  admin = createClient(url!, serviceKey!, { auth: { persistSession: false } });
  const a = await makeOrg("a");
  const b = await makeOrg("b");

  for (const tag of ["alice", "bob", "dual"]) await makeLearner(tag, a);
  await makeLearner("carol", b);

  await makeAuthUser("alice", a, ["student"]);
  await makeAuthUser("bob", a, ["student"]);
  await makeAuthUser("carol", b, ["student"]);
  await makeAuthUser("dual", a, ["student", "coordinator"]);
  await makeAuthUser("coord", a, ["coordinator"]);
  await makeAuthUser("coach", a, ["coach"]);

  await makeAssignment("aliceActive", a, "alice", shift(-1), shift(30));
  await makeAssignment("aliceLastDay", a, "alice", shift(-30), parisToday);
  await makeAssignment("aliceExpired", a, "alice", shift(-60), shift(-1));
  await makeAssignment("aliceUpcoming", a, "alice", shift(1), shift(60));
  await makeAssignment("bobActive", a, "bob", null, null);
  await makeAssignment("carolActive", b, "carol", shift(-1), shift(30));
});

after(async () => {
  if (!configured) return;
  for (const o of Object.values(org)) {
    await admin.from("audit_log").delete().eq("org_id", o);
    await admin.from("resource_assignments").delete().eq("org_id", o);
    await admin.from("enrollments_ro").delete().eq("org_id", o);
    await admin.from("learners_ro").delete().eq("org_id", o);
    await admin.from("memberships").delete().eq("org_id", o);
    await admin.from("organizations").delete().eq("id", o);
  }
  for (const u of Object.values(users)) {
    await admin.from("profiles").delete().eq("id", u.id);
    await admin.auth.admin.deleteUser(u.id);
  }
});

const labels = async (c: SupabaseClient) => {
  const { data, error } = await c.from("resource_assignments").select("resource_label");
  assert.ok(!error, error?.message);
  return (data ?? []).map((r) => r.resource_label as string).sort();
};

test("l'apprenant ne lit que ses propres accès", { skip }, async () => {
  assert.deepEqual(await labels(clients.alice), ["P2W-aliceActive", "P2W-aliceExpired", "P2W-aliceLastDay", "P2W-aliceUpcoming"]);
  assert.deepEqual(await labels(clients.bob), ["P2W-bobActive"]);
});

test("isolation : rien d'un autre organisme", { skip }, async () => {
  assert.deepEqual(await labels(clients.carol), ["P2W-carolActive"]);
  const coord = await labels(clients.coord);
  assert.ok(!coord.includes("P2W-carolActive"), "la coordination de A ne voit pas B");
});

test("la coordination lit les accès de son organisme ; le coach et l'anonyme rien", { skip }, async () => {
  assert.equal((await labels(clients.coord)).length, 5);
  assert.deepEqual(await labels(clients.coach), []);
  const anonClient = createClient(url!, anon!, { auth: { persistSession: false } });
  assert.deepEqual(await labels(anonClient), []);
});

test("aucune écriture hors service-role, même sur ses propres lignes", { skip }, async () => {
  const { error: insErr } = await clients.alice.from("resource_assignments").insert({
    org_id: org.a, enrollment_id: enrollment.alice, airtable_record_id: `${runId}-forge`,
    airtable_resource_id: "recForgedxxxxxxxx", resource_label: "forge",
  });
  assert.ok(insErr, "insertion refusée");

  const { data: upd } = await clients.coord.from("resource_assignments")
    .update({ ends_on: "2099-12-31" }).eq("id", assignment.aliceExpired).select("id");
  assert.equal((upd ?? []).length, 0, "prolongation à la main impossible");

  const { data: del } = await clients.alice.from("resource_assignments").delete().eq("id", assignment.aliceActive).select("id");
  assert.equal((del ?? []).length, 0, "suppression impossible");
  const { data: still } = await admin.from("resource_assignments").select("ends_on").eq("id", assignment.aliceExpired).single();
  assert.equal(still!.ends_on, shift(-1));
});

test("la clé du compte Airtable n'est lisible que par la fonction de révélation", { skip }, async () => {
  const { error } = await clients.alice.from("resource_assignments").select("airtable_resource_id");
  assert.ok(error, "colonne refusée à l'apprenant");
  const { error: coordErr } = await clients.coord.from("resource_assignments").select("airtable_resource_id");
  assert.ok(coordErr, "colonne refusée à la coordination");
});

const reveal = async (c: SupabaseClient, id: string) => {
  const { data, error } = await c.rpc("reveal_resource_assignment", { p_assignment: id });
  assert.ok(!error, error?.message);
  return (data ?? []) as { airtable_resource_id: string; resource_label: string }[];
};

const auditCount = async (actorId: string) => {
  const { data } = await admin.from("audit_log").select("action, detail, subject_id")
    .eq("org_id", org.a).eq("actor_id", actorId).eq("action", "resource.password_request");
  return data ?? [];
};

test("révélation : l'apprenant propriétaire, pendant la période, bornes incluses, demande journalisée", { skip }, async () => {
  const active = await reveal(clients.alice, assignment.aliceActive);
  assert.equal(active.length, 1);
  assert.equal(active[0].resource_label, "P2W-aliceActive");

  const lastDay = await reveal(clients.alice, assignment.aliceLastDay);
  assert.equal(lastDay.length, 1, "le dernier jour de la période est inclus");

  const sansBornes = await reveal(clients.bob, assignment.bobActive);
  assert.equal(sansBornes.length, 1, "une affectation sans dates est active");

  const entries = await auditCount(users.alice.id);
  assert.equal(entries.length, 2, "une entrée par demande autorisée");
  assert.equal(entries[0].subject_id, learner.alice, "rattachée au dossier de l'apprenant");
  assert.ok(entries.every((e) => (e.detail as string).startsWith("Ressource P2W-")), "le détail nomme l'identifiant, jamais un secret");
});

test("révélation refusée hors période, sans trace", { skip }, async () => {
  const before = (await auditCount(users.alice.id)).length;
  assert.equal((await reveal(clients.alice, assignment.aliceExpired)).length, 0, "accès expiré");
  assert.equal((await reveal(clients.alice, assignment.aliceUpcoming)).length, 0, "accès à venir");
  assert.equal((await auditCount(users.alice.id)).length, before, "un refus n'est pas journalisé comme une révélation");
});

test("révélation refusée sur l'accès d'un autre, quel que soit le rôle", { skip }, async () => {
  assert.equal((await reveal(clients.bob, assignment.aliceActive)).length, 0, "autre apprenant");
  assert.equal((await reveal(clients.carol, assignment.aliceActive)).length, 0, "autre organisme");
  assert.equal((await reveal(clients.coord, assignment.aliceActive)).length, 0, "la coordination n'est pas apprenante");
  assert.equal((await reveal(clients.dual, assignment.aliceActive)).length, 0, "apprenant + coordination : pas le secret d'un autre");
  assert.equal((await reveal(clients.alice, "00000000-0000-0000-0000-000000000000")).length, 0, "affectation inexistante");
});

test("l'anonyme ne peut pas exécuter la fonction (verrou EXECUTE)", { skip }, async () => {
  const anonClient = createClient(url!, anon!, { auth: { persistSession: false } });
  const { error } = await anonClient.rpc("reveal_resource_assignment", { p_assignment: assignment.aliceActive });
  assert.ok(error, "exécution refusée à anon");
});
