/**
 * Provenance des accès (INC-29) — contre la vraie RLS.
 *
 * L'enjeu : depuis qu'Airtable est la seule surface de saisie des identités, une
 * ligne `memberships` issue d'une habilitation ne doit plus pouvoir être
 * modifiée à la main. Si elle le pouvait, la source de vérité redeviendrait
 * double et la divergence serait garantie — un rôle retiré dans la plateforme
 * reviendrait au passage de synchronisation suivant, sans que personne comprenne
 * pourquoi.
 *
 * Ce test prouve donc le refus **au niveau base** (policy `membership_manage`,
 * 0031), pas au niveau de l'écran. Il vérifie aussi que le journal des décisions
 * est lisible par le staff, inécrivable par lui, et cloisonné entre organismes.
 *
 * Piège déjà payé, et évité ici : une insertion de fixture qui échoue en silence
 * rend les tests négatifs verts pour la mauvaise raison. Chaque erreur de setup
 * est donc assertée.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const configured =
  !!url && !!anon && !!serviceKey && !url.includes("placeholder") && !serviceKey.includes("placeholder");
const skip = !configured && "Supabase env not configured";

const runId = `access-${Date.now()}`;
const pwd = "Test-Password-123!";
let admin: SupabaseClient;
let orgId = "";
let otherOrgId = "";
const users: Record<string, { id: string; email: string }> = {};
/** Session de la direction de l'organisme sous test. */
let dir: SupabaseClient;
/** Session de la direction d'un AUTRE organisme (preuve d'isolation). */
let outsider: SupabaseClient;
/** Session d'un coach : ni direction ni coordination. */
let coach: SupabaseClient;

const HAB_ID = `recHab-${runId}`;

async function makeUser(
  tag: string,
  role: string,
  org: string,
  extra: Record<string, unknown> = {}
): Promise<void> {
  const email = `${runId}-${tag}@ex.test`.toLowerCase();
  const { data, error } = await admin.auth.admin.createUser({
    email, password: pwd, email_confirm: true, app_metadata: { org_id: org },
  });
  assert.ok(!error && data?.user, `createUser ${tag}: ${error?.message ?? "no user returned"}`);
  const id = data.user.id;
  const { error: pErr } = await admin.from("profiles").insert({ id, email });
  assert.ok(!pErr, `insert profile ${tag}: ${pErr?.message}`);
  const { error: mErr } = await admin
    .from("memberships")
    .insert({ org_id: org, profile_id: id, role, ...extra });
  assert.ok(!mErr, `insert membership ${tag}: ${mErr?.message}`);
  users[tag] = { id, email };
}

async function signIn(tag: string): Promise<SupabaseClient> {
  const client = createClient(url!, anon!, { auth: { persistSession: false } });
  const { error } = await client.auth.signInWithPassword({ email: users[tag].email, password: pwd });
  assert.ok(!error, `sign in ${tag}: ${error?.message}`);
  return client;
}

before(async () => {
  if (!configured) return;
  admin = createClient(url!, serviceKey!, { auth: { persistSession: false } });

  const { data: org, error: orgErr } = await admin
    .from("organizations").insert({ slug: runId, name: "Org accès" }).select("id").single();
  assert.ok(!orgErr && org, `create org: ${orgErr?.message ?? "no row"}`);
  orgId = org.id as string;

  const { data: other, error: otherErr } = await admin
    .from("organizations").insert({ slug: `${runId}-b`, name: "Org voisine" }).select("id").single();
  assert.ok(!otherErr && other, `create other org: ${otherErr?.message ?? "no row"}`);
  otherOrgId = other.id as string;

  // Compte de service : ce que la synchronisation doit laisser tranquille.
  await makeUser("dir", "direction", orgId);
  // Reflet d'une habilitation : ce qui doit devenir intouchable à la main.
  await makeUser("coach", "coach", orgId, { source: "airtable", airtable_habilitation_id: HAB_ID });
  await makeUser("outsider", "direction", otherOrgId);

  dir = await signIn("dir");
  outsider = await signIn("outsider");
  coach = await signIn("coach");

  const { error: logErr } = await admin.from("access_sync_log").insert({
    org_id: orgId, action: "deactivate", email: users.coach.email, role: "coach",
    airtable_habilitation_id: HAB_ID, reason: "habilitation expirée",
  });
  assert.ok(!logErr, `insert access_sync_log: ${logErr?.message}`);
});

after(async () => {
  if (!configured) return;
  await admin.from("access_sync_log").delete().in("org_id", [orgId, otherOrgId]);
  for (const org of [orgId, otherOrgId]) {
    await admin.from("memberships").delete().eq("org_id", org);
    await admin.from("organizations").delete().eq("id", org);
  }
  for (const u of Object.values(users)) {
    await admin.from("profiles").delete().eq("id", u.id);
    await admin.auth.admin.deleteUser(u.id);
  }
});

// -----------------------------------------------------------------------------
// La provenance est un verrou, pas une étiquette
// -----------------------------------------------------------------------------

test("la direction ne peut pas retirer un rôle issu d'Airtable", { skip }, async () => {
  const { error } = await dir
    .from("memberships").delete().eq("org_id", orgId).eq("profile_id", users.coach.id).eq("role", "coach");
  // La policy filtre la ligne : PostgREST ne signale pas d'erreur, il n'efface
  // simplement rien. C'est la persistance de la ligne qui fait la preuve.
  assert.ok(!error || error.code === "42501", `delete: ${error?.message}`);
  const { data } = await admin
    .from("memberships").select("role").eq("org_id", orgId).eq("profile_id", users.coach.id);
  assert.equal(data?.length, 1, "le rôle issu d'Airtable a été retiré alors qu'il devait résister");
});

test("la direction ne peut pas désactiver un accès issu d'Airtable", { skip }, async () => {
  const { error } = await dir
    .from("memberships")
    .update({ deactivated_at: new Date().toISOString() })
    .eq("org_id", orgId)
    .eq("profile_id", users.coach.id);
  assert.ok(!error || error.code === "42501", `update: ${error?.message}`);
  const { data } = await admin
    .from("memberships").select("deactivated_at").eq("org_id", orgId).eq("profile_id", users.coach.id).single();
  assert.equal(data?.deactivated_at, null, "l'accès a été coupé à la main, la RLS devait le refuser");
});

test("personne ne peut fabriquer à la main une ligne marquée Airtable", { skip }, async () => {
  // Sans le `with check` sur la provenance, un coordinateur pourrait se rendre
  // lui-même intouchable en marquant sa propre ligne comme synchronisée.
  const { error } = await dir.from("memberships").insert({
    org_id: orgId, profile_id: users.dir.id, role: "coordinator",
    source: "airtable", airtable_habilitation_id: `${HAB_ID}-forge`,
  });
  assert.ok(error, "l'insertion d'une ligne 'airtable' par un humain doit être refusée");
  assert.equal(error?.code, "42501");
});

test("un compte de service reste administrable (non-régression INC-10)", { skip }, async () => {
  // Le verrou de provenance ne doit pas geler l'administration ordinaire, sinon
  // une panne d'Airtable rendrait la plateforme ingérable.
  const { error } = await dir.from("memberships").insert({
    org_id: orgId, profile_id: users.dir.id, role: "coordinator", invited_by: users.dir.id,
  });
  assert.ok(!error, `un rôle manuel doit pouvoir être attribué : ${error?.message}`);
  const { data } = await admin
    .from("memberships").select("source").eq("org_id", orgId).eq("profile_id", users.dir.id).eq("role", "coordinator").single();
  assert.equal(data?.source, "manual", "une ligne créée à la main doit être de provenance manuelle");

  const { error: delErr } = await dir
    .from("memberships").delete().eq("org_id", orgId).eq("profile_id", users.dir.id).eq("role", "coordinator");
  assert.ok(!delErr, `et pouvoir être retiré : ${delErr?.message}`);
});

test("une habilitation ne peut se refléter qu'une fois par organisme", { skip }, async () => {
  // Idempotence du rapprochement : l'index unique de 0031 est la garantie, le
  // dédoublonnage applicatif n'en est que la politesse.
  const { error } = await admin.from("memberships").insert({
    org_id: orgId, profile_id: users.dir.id, role: "evaluator",
    source: "airtable", airtable_habilitation_id: HAB_ID,
  });
  assert.ok(error, "deux reflets de la même habilitation doivent être refusés");
  assert.equal(error?.code, "23505");
});

// -----------------------------------------------------------------------------
// Le journal des décisions
// -----------------------------------------------------------------------------

test("la direction lit le journal des décisions de son organisme", { skip }, async () => {
  const { data, error } = await dir.from("access_sync_log").select("action, email, reason").eq("org_id", orgId);
  assert.ok(!error, `read log: ${error?.message}`);
  assert.equal(data?.length, 1);
  assert.equal(data?.[0].action, "deactivate");
  assert.equal(data?.[0].reason, "habilitation expirée");
});

test("un coach ne lit pas le journal des décisions", { skip }, async () => {
  // Le journal nomme des personnes et motive des coupures d'accès : il est
  // réservé à la direction et à la coordination.
  const { data, error } = await coach.from("access_sync_log").select("action").eq("org_id", orgId);
  assert.ok(!error, `la lecture doit être vide, pas en erreur : ${error?.message}`);
  assert.equal(data?.length, 0);
});

test("le journal ne se réécrit pas, même par la direction", { skip }, async () => {
  // Une trace que son sujet peut corriger ne vaut rien en audit.
  const { error: insErr } = await dir.from("access_sync_log").insert({
    org_id: orgId, action: "create", email: "forge@ex.test", role: "direction",
  });
  assert.ok(insErr, "l'écriture dans le journal doit être refusée au staff");

  const { error: updErr } = await dir
    .from("access_sync_log").update({ reason: "réécrit" }).eq("org_id", orgId);
  const { data } = await admin.from("access_sync_log").select("reason").eq("org_id", orgId).single();
  assert.ok(!updErr || updErr.code === "42501", `update: ${updErr?.message}`);
  assert.equal(data?.reason, "habilitation expirée", "le motif a été réécrit alors qu'il devait résister");
});

test("le journal est cloisonné entre organismes", { skip }, async () => {
  const { data, error } = await outsider.from("access_sync_log").select("email");
  assert.ok(!error, `read: ${error?.message}`);
  assert.equal(data?.length, 0, "une direction voisine ne doit voir aucune décision de cet organisme");
});
