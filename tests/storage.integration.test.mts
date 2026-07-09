/**
 * Learner documents — Storage isolation (INC-8, écran P.A2).
 *
 * Proves the storage.objects RLS (0015) on the private `learner-docs` bucket:
 *   - a student downloads only their OWN folder ({org}/{their e-mail}/…);
 *   - a student cannot read another student's document (per-learner isolation);
 *   - direction reads any document of their org;
 *   - a student of another org cannot read the first org's document (tenant
 *     isolation).
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

const BUCKET = "learner-docs";
const runId = `stor-${Date.now()}`;
const pwd = "Test-Password-123!";
let admin: SupabaseClient;
const org: Record<string, string> = {}; // tag → orgId
const users: Record<string, { id: string; email: string }> = {};
const clients: Record<string, SupabaseClient> = {};
const paths: Record<string, string> = {};

async function makeOrg(tag: string): Promise<string> {
  const { data } = await admin.from("organizations").insert({ slug: `${runId}-${tag}`, name: `Org ${tag}` }).select("id").single();
  org[tag] = data!.id as string;
  return org[tag];
}
async function makeStudent(tag: string, orgId: string): Promise<{ id: string; email: string }> {
  // e-mails are lowercased on write (trg_lower_email); document paths use the
  // lowercased e-mail, so keep it lowercase everywhere for a faithful match.
  const email = `${runId}-${tag}@ex.test`.toLowerCase();
  const { data } = await admin.auth.admin.createUser({ email, password: pwd, email_confirm: true, app_metadata: { org_id: orgId } });
  const id = data!.user!.id;
  await admin.from("profiles").insert({ id, email });
  await admin.from("memberships").insert({ org_id: orgId, profile_id: id, role: "student" });
  users[tag] = { id, email };
  return users[tag];
}
async function makeDirection(tag: string, orgId: string): Promise<void> {
  const email = `${runId}-${tag}@ex.test`.toLowerCase();
  const { data } = await admin.auth.admin.createUser({ email, password: pwd, email_confirm: true, app_metadata: { org_id: orgId } });
  const id = data!.user!.id;
  await admin.from("profiles").insert({ id, email });
  await admin.from("memberships").insert({ org_id: orgId, profile_id: id, role: "direction" });
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

  const orgA = await makeOrg("a");
  const orgB = await makeOrg("b");
  const sA = await makeStudent("stA", orgA);
  const sB = await makeStudent("stB", orgA);
  const sC = await makeStudent("stC", orgB);
  await makeDirection("dir", orgA);

  // One document per student, in their isolated folder.
  paths.a = `${orgA}/${sA.email}/attestation.txt`;
  paths.b = `${orgA}/${sB.email}/attestation.txt`;
  paths.c = `${orgB}/${sC.email}/attestation.txt`;
  for (const p of Object.values(paths)) {
    const up = await admin.storage.from(BUCKET).upload(p, new Blob([`doc ${p}`]), { upsert: true, contentType: "text/plain" });
    assert.ok(!up.error, `upload ${p}: ${up.error?.message}`);
  }

  for (const tag of ["stA", "stB", "stC", "dir"]) clients[tag] = await signIn(tag);
});

after(async () => {
  if (!configured) return;
  await admin.storage.from(BUCKET).remove(Object.values(paths));
  for (const o of Object.values(org)) {
    await admin.from("enrollments_ro").delete().eq("org_id", o);
    await admin.from("learners_ro").delete().eq("org_id", o);
    await admin.from("organizations").delete().eq("id", o); // cascades memberships
  }
  for (const u of Object.values(users)) {
    await admin.from("profiles").delete().eq("id", u.id);
    await admin.auth.admin.deleteUser(u.id);
  }
});

test("a student downloads their own document", { skip }, async () => {
  const res = await clients.stA.storage.from(BUCKET).download(paths.a);
  assert.ok(!res.error && res.data, `student reads own doc: ${res.error?.message}`);
});

test("a student cannot download another student's document (same org)", { skip }, async () => {
  const res = await clients.stA.storage.from(BUCKET).download(paths.b);
  assert.ok(res.error || !res.data, "student must not read a peer's document");
});

test("direction downloads any document of the org", { skip }, async () => {
  const a = await clients.dir.storage.from(BUCKET).download(paths.a);
  const b = await clients.dir.storage.from(BUCKET).download(paths.b);
  assert.ok(!a.error && a.data, `direction reads doc A: ${a.error?.message}`);
  assert.ok(!b.error && b.data, `direction reads doc B: ${b.error?.message}`);
});

test("a student of another org cannot read the first org's document", { skip }, async () => {
  const res = await clients.stC.storage.from(BUCKET).download(paths.a);
  assert.ok(res.error || !res.data, "cross-org document access must be denied");
});

test("listing a foreign folder returns nothing for a student", { skip }, async () => {
  const own = await clients.stA.storage.from(BUCKET).list(`${org.a}/${users.stA.email}`);
  assert.ok((own.data ?? []).some((f) => f.name === "attestation.txt"), "student lists their own folder");
  const foreign = await clients.stA.storage.from(BUCKET).list(`${org.a}/${users.stB.email}`);
  assert.equal((foreign.data ?? []).length, 0, "student cannot list a peer's folder");
});
