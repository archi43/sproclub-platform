/**
 * Member administration embed — regression test (INC-10 / bug fix).
 *
 * Since 0012, `memberships` has THREE FKs to `profiles` (profile_id, invited_by,
 * deactivated_by). The PostgREST embed used by `listMembers` /
 * `listEvaluatorCandidates` must NAME the intended constraint
 * (`memberships_profile_id_fkey`) or PostgREST errors on the ambiguity — which
 * broke /coordination/administration in production.
 *
 * This test mirrors those exact selects against real RLS (a direction reader) and
 * proves: the disambiguated embed resolves and populates the profile e-mail, AND
 * the old ambiguous embed genuinely errors (the assertion that would have caught
 * the bug). Keep the select strings in sync with src/lib/data/members.ts and
 * src/lib/data/evaluators.ts. Skips without Supabase env.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const configured = !!url && !!anon && !!serviceKey && !url.includes("placeholder") && !serviceKey.includes("placeholder");
const skip = !configured && "Supabase env not configured";

const runId = `members-${Date.now()}`;
const pwd = "Test-Password-123!";
let admin: SupabaseClient;
let orgId = "";
const users: Record<string, { id: string; email: string }> = {};
let dir: SupabaseClient;

async function makeUser(tag: string, role: string): Promise<void> {
  const email = `${runId}-${tag}@ex.test`.toLowerCase();
  // Check every setup error explicitly: a transient failure (e.g. Auth rate
  // limit) must surface a diagnosable message, not an opaque TypeError later.
  const { data, error } = await admin.auth.admin.createUser({ email, password: pwd, email_confirm: true, app_metadata: { org_id: orgId } });
  assert.ok(!error && data?.user, `createUser ${tag}: ${error?.message ?? "no user returned"}`);
  const id = data.user.id;
  const { error: pErr } = await admin.from("profiles").insert({ id, email });
  assert.ok(!pErr, `insert profile ${tag}: ${pErr?.message}`);
  const { error: mErr } = await admin.from("memberships").insert({ org_id: orgId, profile_id: id, role });
  assert.ok(!mErr, `insert membership ${tag}: ${mErr?.message}`);
  users[tag] = { id, email };
}

before(async () => {
  if (!configured) return;
  admin = createClient(url!, serviceKey!, { auth: { persistSession: false } });
  const { data: org, error: orgErr } = await admin.from("organizations").insert({ slug: runId, name: "Org members" }).select("id").single();
  assert.ok(!orgErr && org, `create org: ${orgErr?.message ?? "no row returned"}`);
  orgId = org.id as string;
  await makeUser("dir", "direction");
  await makeUser("coach", "coach");
  await makeUser("eval", "evaluator");
  // Populate the extra FKs so the ambiguity is real: the director invited the
  // others; stamp a deactivated_by too (on a throwaway deactivated row).
  await admin.from("memberships").update({ invited_by: users.dir.id }).eq("org_id", orgId).in("profile_id", [users.coach.id, users.eval.id]);

  dir = createClient(url!, anon!, { auth: { persistSession: false } });
  const { error } = await dir.auth.signInWithPassword({ email: users.dir.email, password: pwd });
  assert.ok(!error, `sign in dir: ${error?.message}`);
});

after(async () => {
  if (!configured) return;
  await admin.from("memberships").delete().eq("org_id", orgId);
  await admin.from("organizations").delete().eq("id", orgId);
  for (const u of Object.values(users)) {
    await admin.from("profiles").delete().eq("id", u.id);
    await admin.auth.admin.deleteUser(u.id);
  }
});

test("listMembers embed resolves and populates the profile e-mail (disambiguated FK)", { skip }, async () => {
  // Mirror of src/lib/data/members.ts → listMembers.
  const { data, error } = await dir
    .from("memberships")
    .select("profile_id, role, created_at, deactivated_at, profile:profiles!memberships_profile_id_fkey(email, full_name)")
    .eq("org_id", orgId);
  assert.ok(!error, `disambiguated embed must not error: ${error?.message}`);
  const rows = (data ?? []) as unknown as { profile_id: string; profile: { email: string } | null }[];
  assert.ok(rows.length >= 3, "direction reads every membership row");
  for (const r of rows) {
    assert.ok(r.profile && r.profile.email, `every row has a populated profile e-mail (got ${JSON.stringify(r.profile)})`);
  }
});

test("listEvaluatorCandidates embed resolves for the evaluator role", { skip }, async () => {
  // Mirror of src/lib/data/evaluators.ts → listEvaluatorCandidates.
  const { data, error } = await dir
    .from("memberships")
    .select("profile_id, profile:profiles!memberships_profile_id_fkey(email, full_name)")
    .eq("org_id", orgId)
    .eq("role", "evaluator")
    .is("deactivated_at", null);
  assert.ok(!error, `disambiguated embed must not error: ${error?.message}`);
  const rows = (data ?? []) as unknown as { profile: { email: string } | null }[];
  assert.equal(rows.length, 1, "one evaluator candidate");
  assert.equal(rows[0].profile?.email, users.eval.email, "candidate e-mail is populated");
});

test("the OLD ambiguous embed errors — the check that would have caught the bug", { skip }, async () => {
  const { error } = await dir
    .from("memberships")
    .select("profile_id, profile:profiles(email, full_name)")
    .eq("org_id", orgId);
  assert.ok(error, "an unqualified profiles embed on memberships is ambiguous and must error");
});
