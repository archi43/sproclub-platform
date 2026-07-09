/**
 * Coach portal & coaching reports — integration test (INC-4, Étape 3).
 *
 * Proves the tightened coach scope (0014) and the coaching_reports RLS on a
 * disposable org:
 *   - a coach reads ONLY their own learners / reservations / deliverables;
 *   - a coach can write a report on their own dossier, but not on another
 *     coach's dossier, and only as themselves (author = caller);
 *   - direction reads every report; a second coach cannot read the first's.
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

const runId = `coach-${Date.now()}`;
const pwd = "Test-Password-123!";
let admin: SupabaseClient;
let orgId = "";
const users: Record<string, { id: string; email: string }> = {};
const enr: Record<string, string> = {};
const learner: Record<string, string> = {};
const resv: Record<string, string> = {};
const clients: Record<string, SupabaseClient> = {};

async function makeUser(tag: string, role: string): Promise<string> {
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

  const c1 = await makeUser("coach1", "coach");
  const c2 = await makeUser("coach2", "coach");
  await makeUser("dir", "direction");
  await makeUser("evalr", "evaluator");

  // Two learners, each coached by a different coach.
  for (const [tag, coach] of [["l1", c1], ["l2", c2]] as const) {
    const { data: l } = await admin.from("learners_ro").insert({
      org_id: orgId, airtable_record_id: `${runId}-${tag}`, unique_learner_id: `${runId}-${tag}`,
      first_name: tag.toUpperCase(), last_name: "Test", email: `${runId}-${tag}@ex.test`,
    }).select("id").single();
    learner[tag] = l!.id as string;
    const { data: e } = await admin.from("enrollments_ro").insert({
      org_id: orgId, airtable_record_id: `${runId}-e-${tag}`, learner_id: l!.id, program: "P",
      status: "En cours", coach_email: coach,
    }).select("id").single();
    enr[tag] = e!.id as string;
    // A coaching reservation + a deliverable per dossier (for scope checks).
    const { data: r } = await admin.from("reservations").insert({
      org_id: orgId, learner_id: l!.id, enrollment_id: e!.id, kind: "coaching",
      starts_at: new Date(Date.now() + 86_400_000).toISOString(),
      ends_at: new Date(Date.now() + 90_000_000).toISOString(), status: "pending",
    }).select("id").single();
    resv[tag] = r!.id as string;
    await admin.from("project_deliverables").insert({
      org_id: orgId, enrollment_id: e!.id, project_number: 1, deliverable_submitted: true,
    });
  }

  // A jury row on coach2's dossier (l2): evaluator in the program pool, not the
  // coach. Lets us prove a coach can't read juries outside their portfolio.
  await admin.from("evaluator_pool").insert({ org_id: orgId, program: "P", evaluator_id: users.evalr.id });
  await admin.from("reservation_evaluators").insert({ org_id: orgId, reservation_id: resv.l2, evaluator_id: users.evalr.id });

  for (const tag of ["coach1", "coach2", "dir"]) clients[tag] = await signIn(tag);
});

after(async () => {
  if (!configured || !orgId) return;
  await admin.from("coaching_reports").delete().eq("org_id", orgId);
  await admin.from("reservation_evaluators").delete().eq("org_id", orgId);
  await admin.from("evaluator_pool").delete().eq("org_id", orgId);
  await admin.from("reservations").delete().eq("org_id", orgId);
  await admin.from("project_deliverables").delete().eq("org_id", orgId);
  await admin.from("enrollments_ro").delete().eq("org_id", orgId);
  await admin.from("learners_ro").delete().eq("org_id", orgId);
  await admin.from("organizations").delete().eq("id", orgId); // cascades memberships
  for (const u of Object.values(users)) {
    await admin.from("profiles").delete().eq("id", u.id);
    await admin.auth.admin.deleteUser(u.id);
  }
});

test("a coach reads only their own learners, reservations and deliverables", { skip }, async () => {
  const c1 = clients.coach1;
  const l = await c1.from("learners_ro").select("id", { count: "exact", head: true }).eq("org_id", orgId);
  assert.equal(l.count, 1, "coach1 sees only their own learner");
  const r = await c1.from("reservations").select("id", { count: "exact", head: true }).eq("org_id", orgId);
  assert.equal(r.count, 1, "coach1 sees only their own dossier's reservation");
  const d = await c1.from("project_deliverables").select("id", { count: "exact", head: true }).eq("org_id", orgId);
  assert.equal(d.count, 1, "coach1 sees only their own dossier's deliverable");
});

test("a coach cannot read juries outside their portfolio", { skip }, async () => {
  // The only jury row is on coach2's dossier (l2).
  const c1 = await clients.coach1.from("reservation_evaluators").select("reservation_id", { count: "exact", head: true }).eq("org_id", orgId);
  assert.equal(c1.count ?? 0, 0, "coach1 does not see coach2's jury");
  const c2 = await clients.coach2.from("reservation_evaluators").select("reservation_id", { count: "exact", head: true }).eq("org_id", orgId);
  assert.equal(c2.count, 1, "coach2 sees the jury of their own dossier");
  const dir = await clients.dir.from("reservation_evaluators").select("reservation_id", { count: "exact", head: true }).eq("org_id", orgId);
  assert.equal(dir.count, 1, "direction sees the jury");
});

test("a coach writes a report on their own dossier, not another coach's", { skip }, async () => {
  const own = await clients.coach1.from("coaching_reports")
    .insert({ org_id: orgId, enrollment_id: enr.l1, author_id: users.coach1.id, body: "Séance 1" })
    .select("id");
  assert.ok(!own.error && (own.data?.length ?? 0) === 1, `coach1 writes on their dossier: ${own.error?.message}`);

  const foreign = await clients.coach1.from("coaching_reports")
    .insert({ org_id: orgId, enrollment_id: enr.l2, author_id: users.coach1.id, body: "Interdit" })
    .select("id");
  assert.ok(foreign.error || (foreign.data?.length ?? 0) === 0, "coach1 cannot write on coach2's dossier");
});

test("a coach can only author as themselves", { skip }, async () => {
  const spoof = await clients.coach1.from("coaching_reports")
    .insert({ org_id: orgId, enrollment_id: enr.l1, author_id: users.coach2.id, body: "Usurpation" })
    .select("id");
  assert.ok(spoof.error || (spoof.data?.length ?? 0) === 0, "coach cannot set another author_id");
});

test("direction reads every report; another coach cannot read it", { skip }, async () => {
  const dir = await clients.dir.from("coaching_reports").select("id", { count: "exact", head: true }).eq("org_id", orgId);
  assert.ok((dir.count ?? 0) >= 1, "direction reads coaching reports");
  const c2 = await clients.coach2.from("coaching_reports").select("id", { count: "exact", head: true }).eq("org_id", orgId);
  assert.equal(c2.count ?? 0, 0, "coach2 cannot read coach1's reports");
});
