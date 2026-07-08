/**
 * Admin role-based access — integration test (INC-2).
 *
 * Proves the role matrix on real RLS, on a disposable org:
 *   - direction sees ALL dossiers + all programs;
 *   - a coach sees ONLY their own learners' dossiers + only published programs;
 *   - a student sees none of the admin dossiers (only their own, here none).
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

const runId = `admin-${Date.now()}`;
const pwd = "Test-Password-123!";
let admin: SupabaseClient;
let orgId = "";
const users: Record<string, { id: string; email: string }> = {};

async function makeUser(tag: string, role: string) {
  const email = `${runId}-${tag}@example.test`;
  const { data } = await admin.auth.admin.createUser({ email, password: pwd, email_confirm: true, app_metadata: { org_id: orgId } });
  const id = data!.user!.id;
  await admin.from("profiles").insert({ id, email });
  await admin.from("memberships").insert({ org_id: orgId, profile_id: id, role });
  users[tag] = { id, email };
  return email;
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
  const { data: org } = await admin.from("organizations").insert({ slug: runId, name: `Org ${runId}` }).select("id").single();
  orgId = org!.id as string;

  const coachEmail = await makeUser("coach", "coach");
  await makeUser("dir", "direction");
  await makeUser("stud", "student");

  // Two learners/enrollments: A is coached by our coach, B is not.
  for (const [tag, coach] of [["a", coachEmail], ["b", `${runId}-other@example.test`]] as const) {
    const { data: l } = await admin.from("learners_ro").insert({
      org_id: orgId, airtable_record_id: `${runId}-${tag}`, unique_learner_id: `${runId}-${tag}`, email: `${runId}-l${tag}@example.test`,
    }).select("id").single();
    await admin.from("enrollments_ro").insert({
      org_id: orgId, airtable_record_id: `${runId}-enr-${tag}`, learner_id: l!.id, program: "P", status: "En cours", coach_email: coach,
    });
  }

  // Programs: one published (with required fields), one draft.
  await admin.from("programs").insert({
    org_id: orgId, name: "Publié", published: true, path_360l: "x", syllabus_url: "x", eval_modalities: "x",
  });
  await admin.from("programs").insert({ org_id: orgId, name: "Brouillon", published: false });
});

after(async () => {
  if (!configured || !orgId) return;
  await admin.from("programs").delete().eq("org_id", orgId);
  await admin.from("enrollments_ro").delete().eq("org_id", orgId);
  await admin.from("learners_ro").delete().eq("org_id", orgId);
  await admin.from("organizations").delete().eq("id", orgId);
  for (const u of Object.values(users)) {
    await admin.from("profiles").delete().eq("id", u.id);
    await admin.auth.admin.deleteUser(u.id);
  }
});

test("direction sees all dossiers and all programs", { skip }, async () => {
  const c = await signIn("dir");
  const enr = await c.from("enrollments_ro").select("id", { count: "exact", head: true });
  assert.equal(enr.count, 2, "direction sees both dossiers");
  const prog = await c.from("programs").select("id", { count: "exact", head: true });
  assert.equal(prog.count, 2, "direction sees published + draft programs");
});

test("a coach sees only their own dossiers and only published programs", { skip }, async () => {
  const c = await signIn("coach");
  const enr = await c.from("enrollments_ro").select("id", { count: "exact", head: true });
  assert.equal(enr.count, 1, "coach sees only their referent dossier");
  const prog = await c.from("programs").select("id", { count: "exact", head: true });
  assert.equal(prog.count, 1, "coach sees only published programs");
});

test("a student sees none of the admin dossiers", { skip }, async () => {
  const c = await signIn("stud");
  const enr = await c.from("enrollments_ro").select("id", { count: "exact", head: true });
  assert.equal(enr.count ?? 0, 0, "student (no matching learner) sees no dossier");
});

test("direction creates a program (no code); publishing an incomplete one is blocked", { skip }, async () => {
  const dir = await signIn("dir");
  // Create a draft program via RLS (no service role) — "create without code".
  const created = await dir.from("programs").insert({ org_id: orgId, name: `Créé ${runId}` }).select("id").single();
  assert.ok(!created.error, `direction can create a program: ${created.error?.message}`);

  // Publishing it while incomplete must be refused by the DB trigger.
  const pub = await dir.from("programs").update({ published: true }).eq("id", created.data!.id);
  assert.ok(pub.error, "publishing without 360L/syllabus/eval must be blocked");

  // A coach cannot create a program (RLS programs_manage).
  const coach = await signIn("coach");
  const denied = await coach.from("programs").insert({ org_id: orgId, name: "Interdit" }).select("id");
  assert.ok(denied.error || (denied.data?.length ?? 0) === 0, "coach cannot create a program");
});
