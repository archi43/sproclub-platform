/**
 * User & role management — integration test (INC-10).
 *
 * Proves, on real RLS on a disposable org, the guarantees of the management
 * layer added in migration 0012:
 *   - direction / coordinator read ALL memberships of the org; a coach reads
 *     only their own (membership_staff_read + membership_self_read);
 *   - direction / coordinator may write memberships; a coach may not
 *     (membership_manage);
 *   - a coordinator can never create, modify or delete a `direction` membership
 *     (privilege escalation guard);
 *   - DEACTIVATING an account cuts its access: the member loses org data and
 *     `set_current_org` rejects — reactivation restores access;
 *   - direction manages the evaluator pool (vivier); a coach cannot.
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

const runId = `roles-${Date.now()}`;
const pwd = "Test-Password-123!";
const PROGRAM = "Prog-" + runId;
let admin: SupabaseClient;
let orgId = "";
const users: Record<string, { id: string; email: string }> = {};
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

  const coachEmail = await makeUser("coach", "coach");
  await makeUser("dir", "direction");
  await makeUser("coord", "coordinator");
  await makeUser("eval", "evaluator");
  await makeUser("stud", "student");

  // One learner/enrollment coached by our coach → the coach sees exactly one
  // dossier while active, zero once deactivated.
  const { data: l } = await admin.from("learners_ro").insert({
    org_id: orgId, airtable_record_id: `${runId}-l`, unique_learner_id: `${runId}-l`, email: `${runId}-learner@example.test`,
  }).select("id").single();
  await admin.from("enrollments_ro").insert({
    org_id: orgId, airtable_record_id: `${runId}-enr`, learner_id: l!.id, program: PROGRAM, status: "En cours", coach_email: coachEmail,
  });

  for (const tag of ["dir", "coord", "coach", "eval", "stud"]) clients[tag] = await signIn(tag);
});

after(async () => {
  if (!configured || !orgId) return;
  await admin.from("evaluator_pool").delete().eq("org_id", orgId);
  await admin.from("enrollments_ro").delete().eq("org_id", orgId);
  await admin.from("learners_ro").delete().eq("org_id", orgId);
  // Delete the org so its memberships cascade away (the last-direction trigger
  // steps aside once the org row is gone) — no explicit memberships delete.
  await admin.from("organizations").delete().eq("id", orgId);
  for (const u of Object.values(users)) {
    await admin.from("profiles").delete().eq("id", u.id);
    await admin.auth.admin.deleteUser(u.id);
  }
});

test("direction and coordinator read all memberships; a coach reads only their own", { skip }, async () => {
  const dir = await clients.dir.from("memberships").select("profile_id", { count: "exact", head: true }).eq("org_id", orgId);
  assert.equal(dir.count, 5, "direction sees every membership of the org");
  const coord = await clients.coord.from("memberships").select("profile_id", { count: "exact", head: true }).eq("org_id", orgId);
  assert.equal(coord.count, 5, "coordinator sees every membership of the org");
  const coach = await clients.coach.from("memberships").select("profile_id", { count: "exact", head: true }).eq("org_id", orgId);
  assert.equal(coach.count, 1, "coach sees only their own membership row");
});

test("direction can grant a role via RLS; a coach cannot", { skip }, async () => {
  const granted = await clients.dir.from("memberships")
    .insert({ org_id: orgId, profile_id: users.stud.id, role: "coach", invited_by: users.dir.id })
    .select("role");
  assert.ok(!granted.error && (granted.data?.length ?? 0) === 1, `direction can grant a role: ${granted.error?.message}`);
  await admin.from("memberships").delete().eq("org_id", orgId).eq("profile_id", users.stud.id).eq("role", "coach");

  const denied = await clients.coach.from("memberships")
    .insert({ org_id: orgId, profile_id: users.stud.id, role: "coach" })
    .select("role");
  assert.ok(denied.error || (denied.data?.length ?? 0) === 0, "a coach cannot grant a role");
});

test("a coordinator cannot create or modify a direction membership", { skip }, async () => {
  // Create a `direction` row → blocked by WITH CHECK (role <> 'direction').
  const created = await clients.coord.from("memberships")
    .insert({ org_id: orgId, profile_id: users.eval.id, role: "direction" })
    .select("role");
  assert.ok(created.error || (created.data?.length ?? 0) === 0, "coordinator cannot create a direction membership");

  // Deactivate the existing director's row → filtered out by USING, 0 rows.
  const updated = await clients.coord.from("memberships")
    .update({ deactivated_at: new Date().toISOString() })
    .eq("org_id", orgId).eq("profile_id", users.dir.id).eq("role", "direction")
    .select("role");
  assert.equal(updated.data?.length ?? 0, 0, "coordinator cannot modify a direction membership");
  // Confirm the director is still active.
  const still = await admin.from("memberships").select("deactivated_at")
    .eq("org_id", orgId).eq("profile_id", users.dir.id).eq("role", "direction").single();
  assert.equal(still.data?.deactivated_at, null, "director remains active");
});

test("deactivating an account cuts its access; reactivation restores it", { skip }, async () => {
  // Baseline: the coach sees their one dossier and can enter the org context.
  const before = await clients.coach.from("enrollments_ro").select("id", { count: "exact", head: true });
  assert.equal(before.count, 1, "active coach sees their dossier");

  // Direction deactivates the coach (via RLS — the real management path).
  const off = await clients.dir.from("memberships")
    .update({ deactivated_at: new Date().toISOString(), deactivated_by: users.dir.id })
    .eq("org_id", orgId).eq("profile_id", users.coach.id).select("role");
  assert.ok(!off.error && (off.data?.length ?? 0) === 1, `direction deactivates the coach: ${off.error?.message}`);

  const after = await clients.coach.from("enrollments_ro").select("id", { count: "exact", head: true });
  assert.equal(after.count ?? 0, 0, "deactivated coach loses access to org data");
  const ctx = await clients.coach.rpc("set_current_org", { p_org: orgId });
  assert.ok(ctx.error, "deactivated coach cannot enter the org context");

  // Reactivate → access restored.
  const on = await clients.dir.from("memberships")
    .update({ deactivated_at: null, deactivated_by: null })
    .eq("org_id", orgId).eq("profile_id", users.coach.id).select("role");
  assert.ok(!on.error && (on.data?.length ?? 0) === 1, `direction reactivates the coach: ${on.error?.message}`);
  const restored = await clients.coach.from("enrollments_ro").select("id", { count: "exact", head: true });
  assert.equal(restored.count, 1, "reactivated coach regains access");
});

test("direction manages the evaluator pool; a coach cannot", { skip }, async () => {
  const added = await clients.dir.from("evaluator_pool")
    .insert({ org_id: orgId, program: PROGRAM, evaluator_id: users.eval.id })
    .select("program");
  assert.ok(!added.error && (added.data?.length ?? 0) === 1, `direction adds to the pool: ${added.error?.message}`);

  const denied = await clients.coach.from("evaluator_pool")
    .insert({ org_id: orgId, program: PROGRAM, evaluator_id: users.eval.id })
    .select("program");
  assert.ok(denied.error || (denied.data?.length ?? 0) === 0, "a coach cannot manage the pool");
});

// Runs LAST: it deactivates the sole director, so it must not precede the tests
// above. The service role bypasses RLS but NOT triggers, so this proves the
// database-level invariant regardless of client.
test("the last active direction cannot be removed or deactivated (DB trigger)", { skip }, async () => {
  const del = await admin.from("memberships").delete()
    .eq("org_id", orgId).eq("profile_id", users.dir.id).eq("role", "direction").select("role");
  assert.ok(del.error, "deleting the last director must be blocked by the trigger");
  const deact = await admin.from("memberships")
    .update({ deactivated_at: new Date().toISOString() })
    .eq("org_id", orgId).eq("profile_id", users.dir.id).eq("role", "direction").select("role");
  assert.ok(deact.error, "deactivating the last director must be blocked by the trigger");

  // With a second active director present, deactivating the first is allowed.
  await makeUser("dir2", "direction");
  const ok = await admin.from("memberships")
    .update({ deactivated_at: new Date().toISOString(), deactivated_by: users.dir2.id })
    .eq("org_id", orgId).eq("profile_id", users.dir.id).eq("role", "direction").select("role");
  assert.ok(!ok.error && (ok.data?.length ?? 0) === 1, `a second director lets the first be deactivated: ${ok.error?.message}`);
});
