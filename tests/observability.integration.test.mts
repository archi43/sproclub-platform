/**
 * Exploitation & observabilité (INC-12). Proves on real RLS, on disposable orgs:
 *   - rate_limit_touch enforces a sliding-window budget and is service-role only
 *     (an authenticated client cannot execute it);
 *   - rate_limit_events is a locked table (no client read/write);
 *   - ops_events is org-scoped and staff-read-only: direction/coordinator read
 *     their org, a coach/student cannot, and no client can insert.
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

const runId = `ops-${Date.now()}`;
const pwd = "Test-Password-123!";
let admin: SupabaseClient;
const org: Record<string, string> = {};
const users: Record<string, { id: string; email: string }> = {};
const clients: Record<string, SupabaseClient> = {};

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
  for (const tag of ["dir", "coord", "coach", "stud"]) clients[tag] = await signIn(tag);
});

after(async () => {
  if (!configured) return;
  await admin.from("rate_limit_events").delete().like("key", `${runId}%`);
  for (const o of Object.values(org)) {
    await admin.from("ops_events").delete().eq("org_id", o);
    await admin.from("organizations").delete().eq("id", o);
  }
  for (const u of Object.values(users)) {
    await admin.from("profiles").delete().eq("id", u.id);
    await admin.auth.admin.deleteUser(u.id);
  }
});

test("rate_limit_touch enforces a sliding-window budget", { skip }, async () => {
  const key = `${runId}-ip1`;
  const call = () => admin.rpc("rate_limit_touch", { p_bucket: "test", p_key: key, p_window_seconds: 60, p_max: 3 });
  const r1 = await call();
  const r2 = await call();
  const r3 = await call();
  const r4 = await call();
  assert.equal(r1.data, true, "1st attempt allowed");
  assert.equal(r2.data, true, "2nd attempt allowed");
  assert.equal(r3.data, true, "3rd attempt allowed (at the limit)");
  assert.equal(r4.data, false, "4th attempt blocked (over the limit)");

  // A different key has an independent budget.
  const other = await admin.rpc("rate_limit_touch", { p_bucket: "test", p_key: `${runId}-ip2`, p_window_seconds: 60, p_max: 3 });
  assert.equal(other.data, true, "an independent key is not affected");
});

test("rate_limit_touch is service-role only; rate_limit_events is a locked table", { skip }, async () => {
  const forbiddenRpc = await clients.dir.rpc("rate_limit_touch", { p_bucket: "test", p_key: `${runId}-x`, p_window_seconds: 60, p_max: 3 });
  assert.ok(forbiddenRpc.error || forbiddenRpc.data == null, "an authenticated client cannot execute rate_limit_touch");

  const read = await clients.dir.from("rate_limit_events").select("id").limit(1);
  assert.equal((read.data ?? []).length, 0, "no client can read the counter table (RLS, no policy)");
  const write = await clients.dir.from("rate_limit_events").insert({ bucket: "test", key: `${runId}-forge` });
  assert.ok(write.error, "no client can write the counter table");
});

test("ops_events is org-scoped and staff-read-only", { skip }, async () => {
  await admin.from("ops_events").insert([
    { org_id: org.a, level: "error", source: "cron.sync", message: "boom" },
    { org_id: org.a, level: "warn", source: "login", message: "slow down" },
    { org_id: org.b, level: "error", source: "cron.sync", message: "other org" },
  ]);

  const dir = await clients.dir.from("ops_events").select("id", { count: "exact", head: true }).eq("org_id", org.a);
  assert.equal(dir.count, 2, "direction reads its org's events");
  const coord = await clients.coord.from("ops_events").select("id", { count: "exact", head: true }).eq("org_id", org.a);
  assert.equal(coord.count, 2, "coordinator reads its org's events");

  const coach = await clients.coach.from("ops_events").select("id", { count: "exact", head: true }).eq("org_id", org.a);
  assert.equal(coach.count ?? 0, 0, "a coach cannot read the operational journal");
  const stud = await clients.stud.from("ops_events").select("id", { count: "exact", head: true }).eq("org_id", org.a);
  assert.equal(stud.count ?? 0, 0, "a student cannot read the operational journal");

  // Cross-tenant isolation: org A staff cannot see org B events.
  const foreign = await clients.dir.from("ops_events").select("id", { count: "exact", head: true }).eq("org_id", org.b);
  assert.equal(foreign.count ?? 0, 0, "staff cannot read another org's events");

  // No client insert policy.
  const write = await clients.dir.from("ops_events").insert({ org_id: org.a, level: "info", source: "forge", message: "nope" });
  assert.ok(write.error, "no client can write ops_events directly");
});
