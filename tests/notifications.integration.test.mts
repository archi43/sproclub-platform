/**
 * Notifications & relances (INC-7). Proves on real RLS, on disposable orgs:
 *   - the send journal is idempotent (unique org_id+dedupe_key — re-enqueue is a
 *     no-op, so a re-run of the cron never duplicates);
 *   - notifications are org-scoped and staff-read-only (coach/student excluded,
 *     cross-org isolation, no client write);
 *   - the opt-out register (notification_prefs) is staff-managed and org-scoped.
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

const runId = `notif-${Date.now()}`;
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

// Mirrors enqueueNotifications' idempotent upsert (the app runs it with the service role).
async function enqueue(orgId: string, dedupe: string, kind = "report_pending") {
  return admin
    .from("notifications")
    .upsert(
      { org_id: orgId, kind, recipient_email: "coach@ex.test", subject: "Sujet", body: "Corps", dedupe_key: dedupe },
      { onConflict: "org_id,dedupe_key", ignoreDuplicates: true }
    )
    .select("id");
}

before(async () => {
  if (!configured) return;
  admin = createClient(url!, serviceKey!, { auth: { persistSession: false } });
  const a = await makeOrg("a");
  await makeOrg("b");
  await makeUser("dir", a, "direction");
  await makeUser("coach", a, "coach");
  await makeUser("stud", a, "student");
  for (const tag of ["dir", "coach", "stud"]) clients[tag] = await signIn(tag);
});

after(async () => {
  if (!configured) return;
  for (const o of Object.values(org)) {
    await admin.from("notifications").delete().eq("org_id", o);
    await admin.from("notification_prefs").delete().eq("org_id", o);
    await admin.from("organizations").delete().eq("id", o);
  }
  for (const u of Object.values(users)) {
    await admin.from("profiles").delete().eq("id", u.id);
    await admin.auth.admin.deleteUser(u.id);
  }
});

test("enqueue is idempotent — re-enqueuing the same dedupe_key creates no duplicate", { skip }, async () => {
  const key = `${runId}:report_pending:e1:2026-07`;
  const first = await enqueue(org.a, key);
  assert.ok(!first.error, `first enqueue: ${first.error?.message}`);
  assert.equal((first.data ?? []).length, 1, "first enqueue inserts one row");

  const second = await enqueue(org.a, key);
  assert.ok(!second.error, `second enqueue: ${second.error?.message}`);
  assert.equal((second.data ?? []).length, 0, "re-enqueue inserts nothing (idempotent)");

  const { count } = await admin.from("notifications").select("id", { count: "exact", head: true }).eq("org_id", org.a).eq("dedupe_key", key);
  assert.equal(count, 1, "exactly one row exists for the dedupe key");
});

test("notifications are org-scoped and staff-read-only", { skip }, async () => {
  await enqueue(org.b, `${runId}:other-org`);

  const dir = await clients.dir.from("notifications").select("id", { count: "exact", head: true }).eq("org_id", org.a);
  assert.ok((dir.count ?? 0) >= 1, "direction reads its org's journal");
  const coach = await clients.coach.from("notifications").select("id", { count: "exact", head: true }).eq("org_id", org.a);
  assert.equal(coach.count ?? 0, 0, "a coach cannot read the notifications journal");
  const stud = await clients.stud.from("notifications").select("id", { count: "exact", head: true }).eq("org_id", org.a);
  assert.equal(stud.count ?? 0, 0, "a student cannot read the notifications journal");

  const foreign = await clients.dir.from("notifications").select("id", { count: "exact", head: true }).eq("org_id", org.b);
  assert.equal(foreign.count ?? 0, 0, "staff cannot read another org's journal");

  const write = await clients.dir.from("notifications").insert({ org_id: org.a, kind: "report_pending", recipient_email: "x@ex.test", subject: "s", body: "b", dedupe_key: `${runId}:forge` });
  assert.ok(write.error, "no client can write the journal directly");
});

test("the opt-out register is staff-managed and org-scoped", { skip }, async () => {
  const ins = await clients.dir.from("notification_prefs").insert({ org_id: org.a, email: "coach@ex.test", kind: "report_pending", opted_out: true });
  assert.ok(!ins.error, `direction manages prefs: ${ins.error?.message}`);

  const dirRead = await clients.dir.from("notification_prefs").select("id", { count: "exact", head: true }).eq("org_id", org.a);
  assert.equal(dirRead.count, 1, "direction reads its org's opt-out register");

  const coachManage = await clients.coach.from("notification_prefs").insert({ org_id: org.a, email: "x@ex.test", kind: "report_pending", opted_out: true });
  assert.ok(coachManage.error, "a coach cannot manage the opt-out register");
});
