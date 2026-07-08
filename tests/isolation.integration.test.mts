/**
 * Tenant isolation — integration test.
 *
 * Proves that an authenticated user of organization A can NEVER read the data
 * of organization B, with Row Level Security as the enforcement point (not an
 * application filter). Runs against a real Supabase project with migrations
 * 0001 → 0003 applied.
 *
 * Required environment (see .env.local / CI secrets):
 *   NEXT_PUBLIC_SUPABASE_URL           project URL (EU region)
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY      anon key (used by the user-scoped client)
 *   SUPABASE_SERVICE_ROLE_KEY          service role key (test setup/teardown only)
 *
 * If these are absent the whole suite is skipped, so it is safe to run before a
 * Supabase project exists. Run with:  npm run test:isolation
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const configured =
  !!url && !!anonKey && !!serviceKey && !url.includes("placeholder") && !serviceKey.includes("placeholder");

// A unique run id keeps the test idempotent and parallel-safe.
const runId = `iso-${Date.now()}`;
const pwd = "Test-Password-123!";

type Fixture = {
  orgId: string;
  userId: string;
  email: string;
  enrollmentId: string;
  learnerId: string;
};

let admin: SupabaseClient;
const orgs: Record<"a" | "b", Fixture> = {} as never;

/** Provision one org with a student user, learner and enrollment. */
async function provisionOrg(key: "a" | "b"): Promise<Fixture> {
  const slug = `${runId}-${key}`;
  const email = `${runId}-${key}@example.test`;

  const { data: org, error: orgErr } = await admin
    .from("organizations")
    .insert({ slug, name: `Org ${key.toUpperCase()} ${runId}` })
    .select("id")
    .single();
  assert.ok(!orgErr, `create org ${key}: ${orgErr?.message}`);
  const orgId = org!.id as string;

  const { data: created, error: userErr } = await admin.auth.admin.createUser({
    email,
    password: pwd,
    email_confirm: true,
    // The org claim is what current_org_id() reads under connection pooling.
    app_metadata: { org_id: orgId },
  });
  assert.ok(!userErr, `create user ${key}: ${userErr?.message}`);
  const userId = created!.user!.id;

  await admin.from("profiles").insert({ id: userId, email });
  await admin.from("memberships").insert({ org_id: orgId, profile_id: userId, role: "student" });

  const { data: learner } = await admin
    .from("learners_ro")
    .insert({
      org_id: orgId,
      airtable_record_id: `${runId}-${key}-rec`,
      unique_learner_id: `${runId}-${key}-uid`,
      email,
    })
    .select("id")
    .single();
  const learnerId = learner!.id as string;

  const { data: enrollment } = await admin
    .from("enrollments_ro")
    .insert({
      org_id: orgId,
      airtable_record_id: `${runId}-${key}-enr`,
      learner_id: learnerId,
      program: `Program ${key}`,
      status: "active",
    })
    .select("id")
    .single();

  return { orgId, userId, email, enrollmentId: enrollment!.id as string, learnerId };
}

before(async () => {
  if (!configured) return;
  admin = createClient(url!, serviceKey!, { auth: { persistSession: false } });
  orgs.a = await provisionOrg("a");
  orgs.b = await provisionOrg("b");
});

after(async () => {
  if (!configured || !admin) return;
  // FK-safe teardown: the org_id foreign keys have no ON DELETE CASCADE, so
  // child rows must go before the organization. profiles cascade to memberships.
  for (const key of ["a", "b"] as const) {
    const f = orgs[key];
    if (!f) continue;
    await admin.from("enrollments_ro").delete().eq("org_id", f.orgId);
    await admin.from("learners_ro").delete().eq("org_id", f.orgId);
    await admin.from("memberships").delete().eq("org_id", f.orgId);
    await admin.from("organizations").delete().eq("id", f.orgId);
    await admin.from("profiles").delete().eq("id", f.userId);
    await admin.auth.admin.deleteUser(f.userId);
  }
});

/** A user-scoped client authenticated as the given org's student. */
async function signInAs(f: Fixture): Promise<SupabaseClient> {
  const client = createClient(url!, anonKey!, { auth: { persistSession: false } });
  const { error } = await client.auth.signInWithPassword({ email: f.email, password: pwd });
  assert.ok(!error, `sign in: ${error?.message}`);
  return client;
}

test("a student sees their own organization's enrollment", { skip: !configured && "Supabase env not configured" }, async () => {
  const client = await signInAs(orgs.a);
  const { data, error } = await client.from("enrollments_ro").select("id, org_id");
  assert.ok(!error, error?.message);
  assert.equal(data!.length, 1, "should see exactly one enrollment (their own org)");
  assert.equal(data![0].org_id, orgs.a.orgId);
});

test("a student CANNOT read another organization's enrollment", { skip: !configured && "Supabase env not configured" }, async () => {
  const client = await signInAs(orgs.a);

  // Even when explicitly targeting org B's ids, RLS returns nothing.
  const byOrg = await client.from("enrollments_ro").select("id").eq("org_id", orgs.b.orgId);
  assert.equal(byOrg.data?.length ?? 0, 0, "must not read org B rows by org_id");

  const byId = await client.from("enrollments_ro").select("id").eq("id", orgs.b.enrollmentId);
  assert.equal(byId.data?.length ?? 0, 0, "must not read org B row by primary key");

  const learners = await client.from("learners_ro").select("id").eq("org_id", orgs.b.orgId);
  assert.equal(learners.data?.length ?? 0, 0, "must not read org B learners");
});

test("set_current_org refuses an organization the user does not belong to", { skip: !configured && "Supabase env not configured" }, async () => {
  const client = await signInAs(orgs.a);
  const { error } = await client.rpc("set_current_org", { p_org: orgs.b.orgId });
  assert.ok(error, "set_current_org must reject a foreign organization");
});
