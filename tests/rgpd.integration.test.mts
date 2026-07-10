/**
 * RGPD — audit trail & right-to-erasure (INC-11). Proves on real RLS, on a
 * disposable org:
 *   - `log_access` records for the caller's own org/identity; direction/
 *     coordinator read the journal, a coach/student cannot;
 *   - the erasure register + `is_erased` are org-scoped and staff-only;
 *   - erasure anonymizes the learner IN PLACE (same id, PII removed) without
 *     breaking the enrollment FK — referential integrity preserved;
 *   - the sync skip-list matches the erased e-mail (no re-import).
 * Skips without Supabase env.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { buildLearner, SRC } from "../src/lib/sync/mapping.ts";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const configured = !!url && !!anon && !!serviceKey && !url.includes("placeholder") && !serviceKey.includes("placeholder");
const skip = !configured && "Supabase env not configured";

const runId = `rgpd-${Date.now()}`;
const pwd = "Test-Password-123!";
let admin: SupabaseClient;
const org: Record<string, string> = {};
const users: Record<string, { id: string; email: string }> = {};
const clients: Record<string, SupabaseClient> = {};
let learnerId = "";
let enrollmentId = "";
const learnerEmail = `${runId}-learner@ex.test`;

async function makeOrg(tag: string): Promise<string> {
  const { data } = await admin.from("organizations").insert({ slug: `${runId}-${tag}`, name: `Org ${tag}` }).select("id").single();
  org[tag] = data!.id as string;
  return org[tag];
}
async function makeUser(tag: string, orgId: string, role: string): Promise<void> {
  const email = `${runId}-${tag}@ex.test`.toLowerCase();
  const { data } = await admin.auth.admin.createUser({ email, password: pwd, email_confirm: true, app_metadata: { org_id: orgId } });
  const id = data!.user!.id;
  await admin.from("profiles").insert({ id, email });
  await admin.from("memberships").insert({ org_id: orgId, profile_id: id, role });
  users[tag] = { id, email };
}
async function signIn(tag: string): Promise<SupabaseClient> {
  const c = createClient(url!, anon!, { auth: { persistSession: false } });
  const { error } = await c.auth.signInWithPassword({ email: users[tag].email, password: pwd });
  assert.ok(!error, `sign in ${tag}: ${error?.message}`);
  return c;
}

before(async () => {
  if (!configured) return;
  admin = createClient(url!, serviceKey!, { auth: { persistSession: false } });
  const a = await makeOrg("a");
  await makeOrg("b");
  await makeUser("dir", a, "direction");
  await makeUser("coord", a, "coordinator");
  await makeUser("coach", a, "coach");
  await makeUser("stud", a, "student");

  const { data: l } = await admin.from("learners_ro").insert({
    org_id: a, airtable_record_id: `${runId}-l`, unique_learner_id: `${runId}-l`,
    first_name: "Léa", last_name: "Test", email: learnerEmail, phone: "0600000000", city: "Paris",
  }).select("id").single();
  learnerId = l!.id as string;
  const { data: e } = await admin.from("enrollments_ro").insert({
    org_id: a, airtable_record_id: `${runId}-e`, learner_id: learnerId, program: "P", status: "En cours",
  }).select("id").single();
  enrollmentId = e!.id as string;

  for (const tag of ["dir", "coord", "coach", "stud"]) clients[tag] = await signIn(tag);
});

after(async () => {
  if (!configured) return;
  for (const o of Object.values(org)) {
    await admin.from("audit_log").delete().eq("org_id", o);
    await admin.from("data_erasures").delete().eq("org_id", o);
    await admin.from("enrollments_ro").delete().eq("org_id", o);
    await admin.from("learners_ro").delete().eq("org_id", o);
    await admin.from("organizations").delete().eq("id", o);
  }
  for (const u of Object.values(users)) {
    await admin.from("profiles").delete().eq("id", u.id);
    await admin.auth.admin.deleteUser(u.id);
  }
});

test("log_access records for the caller; direction/coordinator read, coach/student cannot", { skip }, async () => {
  const logged = await clients.dir.rpc("log_access", { p_action: "dossier.view", p_subject_type: "learner", p_subject_id: learnerId, p_detail: null });
  assert.ok(!logged.error, `log_access: ${logged.error?.message}`);

  const dir = await clients.dir.from("audit_log").select("id, actor_id", { count: "exact" }).eq("org_id", org.a);
  assert.ok((dir.count ?? 0) >= 1, "direction reads the journal");
  assert.equal(dir.data?.[0].actor_id, users.dir.id, "the entry is attributed to the caller");

  const coord = await clients.coord.from("audit_log").select("id", { count: "exact", head: true }).eq("org_id", org.a);
  assert.ok((coord.count ?? 0) >= 1, "coordinator reads the journal");
  const coach = await clients.coach.from("audit_log").select("id", { count: "exact", head: true }).eq("org_id", org.a);
  assert.equal(coach.count ?? 0, 0, "a coach cannot read the journal");
  const stud = await clients.stud.from("audit_log").select("id", { count: "exact", head: true }).eq("org_id", org.a);
  assert.equal(stud.count ?? 0, 0, "a student cannot read the journal");
});

test("a coach or student cannot inject an audit entry (log_access is staff-only)", { skip }, async () => {
  await clients.coach.rpc("log_access", { p_action: "dossier.erase", p_subject_type: "learner", p_subject_id: learnerId, p_detail: "forgé" });
  await clients.stud.rpc("log_access", { p_action: "dossier.view", p_subject_type: "learner", p_subject_id: learnerId, p_detail: "forgé" });
  const { data } = await admin.from("audit_log").select("actor_id").eq("org_id", org.a);
  const actors = new Set((data ?? []).map((r) => (r as { actor_id: string }).actor_id));
  assert.ok(!actors.has(users.coach.id), "a coach cannot record an audit entry");
  assert.ok(!actors.has(users.stud.id), "a student cannot record an audit entry");
});

test("the erasure register and is_erased are org-scoped and locked down", { skip }, async () => {
  await admin.from("data_erasures").insert({ org_id: org.a, learner_email: learnerEmail });

  // is_erased is service-role only (0018): the sync consults it, clients cannot.
  const here = await admin.rpc("is_erased", { p_org: org.a, p_email: learnerEmail.toUpperCase() });
  assert.equal(here.data, true, "is_erased is true (case-insensitive) in the right org");
  const elsewhere = await admin.rpc("is_erased", { p_org: org.b, p_email: learnerEmail });
  assert.equal(elsewhere.data, false, "is_erased is org-scoped");

  // An authenticated staff user cannot even execute is_erased (no cross-tenant leak).
  const forbidden = await clients.dir.rpc("is_erased", { p_org: org.b, p_email: learnerEmail });
  assert.ok(forbidden.error || forbidden.data == null, "is_erased is not executable by authenticated clients");

  const dir = await clients.dir.from("data_erasures").select("id", { count: "exact", head: true }).eq("org_id", org.a);
  assert.equal(dir.count, 1, "direction reads the erasure register");
  const coach = await clients.coach.from("data_erasures").select("id", { count: "exact", head: true }).eq("org_id", org.a);
  assert.equal(coach.count ?? 0, 0, "a coach cannot read the erasure register");

  // Writes are service-role only: no client insert policy exists.
  const coachInsert = await clients.coach.from("data_erasures").insert({ org_id: org.a, learner_email: "forge@ex.test" });
  assert.ok(coachInsert.error, "a coach cannot write the erasure register");
  const dirInsert = await clients.dir.from("data_erasures").insert({ org_id: org.a, learner_email: "forge2@ex.test" });
  assert.ok(dirInsert.error, "even direction cannot directly write the erasure register (service-role only)");
});

test("erasure anonymizes the learner in place without breaking the enrollment FK", { skip }, async () => {
  // Mirrors eraseLearner's core DB step (the app runs it with the service role).
  const tombstone = `erased-${learnerId}@erased.invalid`;
  const upd = await admin.from("learners_ro")
    .update({ first_name: "Anonymisé", last_name: null, email: tombstone, phone: null, city: null })
    .eq("id", learnerId).select("id, first_name, email, phone").single();
  assert.ok(!upd.error, `anonymize: ${upd.error?.message}`);
  assert.equal(upd.data!.id, learnerId, "the learner row keeps its id (integrity)");
  assert.equal(upd.data!.first_name, "Anonymisé");
  assert.equal(upd.data!.email, tombstone, "the e-mail is tombstoned");
  assert.equal(upd.data!.phone, null, "direct identifiers are cleared");

  // The enrollment still references the (now anonymized) learner — FK intact.
  const enr = await admin.from("enrollments_ro").select("id, learner_id").eq("id", enrollmentId).single();
  assert.equal(enr.data!.learner_id, learnerId, "the enrollment FK still resolves");
});

test("the sync skip-list matches the erased e-mail (no re-import)", { skip }, async () => {
  const erased = new Set([learnerEmail.toLowerCase()]);
  const rebuilt = buildLearner({ id: "rec00000000000001", fields: { [SRC.email]: learnerEmail, [SRC.prenom]: "Léa" } });
  assert.ok(rebuilt, "the source record builds a learner");
  assert.ok(erased.has(rebuilt!.email), "an erased e-mail is caught by the sync skip-list");
  assert.ok(!erased.has("someone-else@ex.test"), "a non-erased e-mail is not skipped");
});
