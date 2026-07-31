/**
 * Disponibilités déclarées (INC-19) — intégration contre la vraie base, orgs
 * jetables. Prouve le modèle de confidentialité et de propriété :
 *   1. chacun ne gère QUE ses propres plages ; usurper `host_id` est refusé ;
 *   2. un coach ne lit pas les plages d'un autre coach ;
 *   3. un apprenant ne déclare aucune disponibilité (rôle non autorisé) ;
 *   4. le LIEN D'AGENDA est un secret : la direction ne le lit pas ;
 *   5. `busy_periods` n'est écrite que par le service-role, même pas par le staff ;
 *   6. isolation inter-organismes ;
 *   7. la coordination garde la main (correction/suppression).
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

const runId = `avail-${Date.now()}`;
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

async function makeAuthUser(tag: string, orgId: string, role: string): Promise<void> {
  const email = `${runId}-${tag}@ex.test`.toLowerCase();
  const { data } = await admin.auth.admin.createUser({ email, password: pwd, email_confirm: true, app_metadata: { org_id: orgId } });
  const id = data!.user!.id;
  await admin.from("profiles").insert({ id, email });
  await admin.from("memberships").insert({ org_id: orgId, profile_id: id, role });
  users[tag] = { id, email };
  const c = createClient(url!, anon!, { auth: { persistSession: false } });
  const { error } = await c.auth.signInWithPassword({ email, password: pwd });
  assert.ok(!error, `sign in ${tag}: ${error?.message}`);
  clients[tag] = c;
}

const rule = (hostId: string, orgId: string) => ({
  org_id: orgId,
  host_id: hostId,
  kind: "coaching",
  weekday: 2,
  start_time: "14:00",
  end_time: "17:00",
  slot_minutes: 60,
});

before(async () => {
  if (!configured) return;
  admin = createClient(url!, serviceKey!, { auth: { persistSession: false } });
  const a = await makeOrg("a");
  const b = await makeOrg("b");

  await makeAuthUser("coach", a, "coach");
  await makeAuthUser("coach2", a, "coach");
  await makeAuthUser("jury", a, "evaluator");
  await makeAuthUser("dir", a, "direction");
  await makeAuthUser("student", a, "student");
  await makeAuthUser("coachB", b, "coach");
});

after(async () => {
  if (!configured) return;
  for (const o of Object.values(org)) {
    await admin.from("busy_periods").delete().eq("org_id", o);
    await admin.from("calendar_feeds").delete().eq("org_id", o);
    await admin.from("availability_blocks").delete().eq("org_id", o);
    await admin.from("availability_rules").delete().eq("org_id", o);
    await admin.from("availabilities").delete().eq("org_id", o);
    await admin.from("memberships").delete().eq("org_id", o);
    await admin.from("organizations").delete().eq("id", o);
  }
  for (const u of Object.values(users)) {
    await admin.from("profiles").delete().eq("id", u.id);
    await admin.auth.admin.deleteUser(u.id);
  }
});

test("un coach déclare SES plages, et ne peut pas en créer pour autrui", { skip }, async () => {
  const { error: own } = await clients.coach.from("availability_rules").insert(rule(users.coach.id, org.a));
  assert.ok(!own, `sa propre plage doit passer : ${own?.message}`);

  const { error: usurped } = await clients.coach
    .from("availability_rules")
    .insert(rule(users.coach2.id, org.a));
  assert.ok(usurped, "déclarer une plage au nom d'un autre coach doit être refusé");
});

test("un évaluateur déclare aussi ses plages (portail jury)", { skip }, async () => {
  const { error } = await clients.jury
    .from("availability_rules")
    .insert({ ...rule(users.jury.id, org.a), kind: "defense" });
  assert.ok(!error, `le jury doit pouvoir publier : ${error?.message}`);
});

test("un coach ne lit pas les plages d'un autre coach", { skip }, async () => {
  const { data, error } = await clients.coach2.from("availability_rules").select("id, host_id");
  assert.ok(!error, error?.message);
  assert.ok(
    data!.every((r) => r.host_id === users.coach2.id),
    "seules ses propres plages sont visibles"
  );
});

test("un apprenant ne déclare aucune disponibilité", { skip }, async () => {
  const { error } = await clients.student.from("availability_rules").insert(rule(users.student.id, org.a));
  assert.ok(error, "le rôle student n'est pas autorisé à publier des créneaux");
});

test("le lien d'agenda est un secret : la direction ne le lit pas", { skip }, async () => {
  const { error: saved } = await clients.coach.from("calendar_feeds").insert({
    org_id: org.a,
    profile_id: users.coach.id,
    ics_url: "https://calendar.example.test/private/basic.ics",
  });
  assert.ok(!saved, `le coach enregistre son agenda : ${saved?.message}`);

  const mine = await clients.coach.from("calendar_feeds").select("ics_url");
  assert.equal(mine.data!.length, 1, "il relit le sien");

  const staff = await clients.dir.from("calendar_feeds").select("ics_url");
  assert.ok(!staff.error, staff.error?.message);
  assert.equal(staff.data!.length, 0, "la direction ne voit AUCUN lien d'agenda");

  const otherCoach = await clients.coach2.from("calendar_feeds").select("ics_url");
  assert.equal(otherCoach.data!.length, 0, "ni un collègue");
});

test("busy_periods : écriture réservée au service-role, lecture bornée", { skip }, async () => {
  const { error: byCoach } = await clients.coach.from("busy_periods").insert({
    org_id: org.a,
    host_id: users.coach.id,
    starts_at: "2026-09-08T08:00:00Z",
    ends_at: "2026-09-08T09:00:00Z",
  });
  assert.ok(byCoach, "le titulaire lui-même n'écrit pas ses occupations");

  const { error: byStaff } = await clients.dir.from("busy_periods").insert({
    org_id: org.a,
    host_id: users.coach.id,
    starts_at: "2026-09-08T08:00:00Z",
    ends_at: "2026-09-08T09:00:00Z",
  });
  assert.ok(byStaff, "ni la direction");

  // Le job (service-role) écrit, puis chacun lit ce qui le concerne.
  const { error: byJob } = await admin.from("busy_periods").insert({
    org_id: org.a,
    host_id: users.coach.id,
    starts_at: "2026-09-08T08:00:00Z",
    ends_at: "2026-09-08T09:00:00Z",
    source: "ics",
    external_uid: `${runId}-evt`,
  });
  assert.ok(!byJob, `le job doit pouvoir écrire : ${byJob?.message}`);

  const own = await clients.coach.from("busy_periods").select("id");
  assert.equal(own.data!.length, 1, "le titulaire voit ses occupations");

  const staff = await clients.dir.from("busy_periods").select("id");
  assert.equal(staff.data!.length, 1, "la coordination aussi (planning), sans le lien ni le détail");

  const colleague = await clients.coach2.from("busy_periods").select("id");
  assert.equal(colleague.data!.length, 0, "un collègue ne voit rien");
});

test("un titulaire publie ses créneaux, jamais ceux d'un autre", { skip }, async () => {
  const slot = {
    org_id: org.a,
    kind: "coaching",
    starts_at: "2026-09-15T12:00:00Z",
    ends_at: "2026-09-15T13:00:00Z",
  };
  const { error: own } = await clients.coach
    .from("availabilities")
    .insert({ ...slot, host_id: users.coach.id, calcom_ref: `self:${users.coach.id}:2026-09-15T12:00:00Z` });
  assert.ok(!own, `publication de son créneau : ${own?.message}`);

  const { error: forOther } = await clients.coach
    .from("availabilities")
    .insert({ ...slot, host_id: users.coach2.id, starts_at: "2026-09-15T14:00:00Z", ends_at: "2026-09-15T15:00:00Z", calcom_ref: "self:x" });
  assert.ok(forOther, "publier au nom d'un autre hôte doit être refusé");
});

test("isolation : rien ne traverse la frontière d'organisme", { skip }, async () => {
  const rules = await clients.coachB.from("availability_rules").select("id");
  assert.ok(!rules.error, rules.error?.message);
  assert.equal(rules.data!.length, 0, "aucune plage de l'org A");

  const feeds = await clients.coachB.from("calendar_feeds").select("id");
  assert.equal(feeds.data!.length, 0, "aucun agenda de l'org A");

  const busy = await clients.coachB.from("busy_periods").select("id");
  assert.equal(busy.data!.length, 0, "aucune occupation de l'org A");

  // Écrire chez le voisin est refusé même en se nommant soi-même hôte.
  const { error } = await clients.coachB.from("availability_rules").insert(rule(users.coachB.id, org.a));
  assert.ok(error, "insertion dans l'organisme voisin refusée");
});

test("la coordination corrige et supprime une plage", { skip }, async () => {
  const { data: mine } = await clients.coach.from("availability_rules").select("id").limit(1);
  const id = mine![0].id as string;

  const { error: upd } = await clients.dir
    .from("availability_rules")
    .update({ end_time: "18:00" })
    .eq("id", id);
  assert.ok(!upd, `la coordination doit pouvoir corriger : ${upd?.message}`);

  const { error: del } = await clients.dir.from("availability_rules").delete().eq("id", id);
  assert.ok(!del, `et supprimer : ${del?.message}`);

  const left = await clients.coach.from("availability_rules").select("id").eq("id", id);
  assert.equal(left.data!.length, 0, "la plage a bien disparu");
});
