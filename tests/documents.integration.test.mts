/**
 * Document emissions — integration test (INC-9). Proves the emission journal RLS
 * (0016) and that an archived document is retrievable by the right people, on a
 * disposable org. A generated document = a PDF in the learner-docs bucket + a
 * `document_emissions` row (both written by the service role here, mirroring the
 * generation flow). Skips without Supabase env.
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
const runId = `doc-${Date.now()}`;
const pwd = "Test-Password-123!";
let admin: SupabaseClient;
const org: Record<string, string> = {};
const users: Record<string, { id: string; email: string }> = {};
const enr: Record<string, string> = {};
const clients: Record<string, SupabaseClient> = {};
let docPath = "";

async function makeOrg(tag: string): Promise<string> {
  const { data } = await admin.from("organizations").insert({ slug: `${runId}-${tag}`, name: `Org ${tag}` }).select("id").single();
  org[tag] = data!.id as string;
  return org[tag];
}
async function makeUser(tag: string, orgId: string, role: string): Promise<{ id: string; email: string }> {
  const email = `${runId}-${tag}@ex.test`.toLowerCase();
  const { data } = await admin.auth.admin.createUser({ email, password: pwd, email_confirm: true, app_metadata: { org_id: orgId } });
  const id = data!.user!.id;
  await admin.from("profiles").insert({ id, email });
  await admin.from("memberships").insert({ org_id: orgId, profile_id: id, role });
  users[tag] = { id, email };
  return users[tag];
}
async function makeDossier(tag: string, orgId: string, email: string): Promise<string> {
  const { data: l } = await admin.from("learners_ro").insert({
    org_id: orgId, airtable_record_id: `${runId}-${tag}`, unique_learner_id: `${runId}-${tag}`, email,
  }).select("id").single();
  const { data: e } = await admin.from("enrollments_ro").insert({
    org_id: orgId, airtable_record_id: `${runId}-e-${tag}`, learner_id: l!.id, program: "P", status: "En cours",
  }).select("id").single();
  enr[tag] = e!.id as string;
  return enr[tag];
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
  const b = await makeOrg("b");
  const sA = await makeUser("stA", a, "student");
  const sPeer = await makeUser("stPeer", a, "student");
  await makeUser("dir", a, "direction");
  await makeUser("stC", b, "student");
  const enrA = await makeDossier("stA", a, sA.email);
  await makeDossier("stPeer", a, sPeer.email);

  // Simulate a generated document for student A.
  docPath = `${a}/${sA.email}/attestation_entree-${runId}.pdf`;
  const up = await admin.storage.from(BUCKET).upload(docPath, new Blob(["%PDF-1.4 test"]), { contentType: "application/pdf", upsert: true });
  assert.ok(!up.error, `upload: ${up.error?.message}`);
  await admin.from("document_emissions").insert({
    org_id: a, enrollment_id: enrA, learner_email: sA.email, kind: "attestation_entree",
    storage_path: docPath, generated_by: users.dir.id,
  });

  for (const tag of ["stA", "stPeer", "dir", "stC"]) clients[tag] = await signIn(tag);
});

after(async () => {
  if (!configured) return;
  await admin.storage.from(BUCKET).remove([docPath]);
  for (const o of Object.values(org)) {
    await admin.from("document_emissions").delete().eq("org_id", o);
    await admin.from("enrollments_ro").delete().eq("org_id", o);
    await admin.from("learners_ro").delete().eq("org_id", o);
    await admin.from("organizations").delete().eq("id", o);
  }
  for (const u of Object.values(users)) {
    await admin.from("profiles").delete().eq("id", u.id);
    await admin.auth.admin.deleteUser(u.id);
  }
});

test("direction reads the org's emission journal", { skip }, async () => {
  const r = await clients.dir.from("document_emissions").select("id", { count: "exact", head: true }).eq("org_id", org.a);
  assert.equal(r.count, 1, "direction sees the emission");
});

test("a student sees their own emission, a peer does not", { skip }, async () => {
  const own = await clients.stA.from("document_emissions").select("id", { count: "exact", head: true }).eq("org_id", org.a);
  assert.equal(own.count, 1, "student sees their own document history");
  const peer = await clients.stPeer.from("document_emissions").select("id", { count: "exact", head: true }).eq("org_id", org.a);
  assert.equal(peer.count ?? 0, 0, "a peer cannot see it");
});

test("a student of another org cannot see the emission", { skip }, async () => {
  const r = await clients.stC.from("document_emissions").select("id", { count: "exact", head: true }).eq("org_id", org.a);
  assert.equal(r.count ?? 0, 0, "cross-org journal access denied");
});

test("the archived document is retrievable by its learner, not by a peer", { skip }, async () => {
  const own = await clients.stA.storage.from(BUCKET).download(docPath);
  assert.ok(!own.error && own.data, `learner downloads their archived document: ${own.error?.message}`);
  const peer = await clients.stPeer.storage.from(BUCKET).download(docPath);
  assert.ok(peer.error || !peer.data, "a peer cannot download it");
});
