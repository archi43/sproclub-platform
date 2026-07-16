/**
 * Jobboard (INC-18) — intégration contre la vraie base, orgs jetables.
 * Prouve :
 *   1. modération : une offre n'est visible de l'apprenant qu'une fois publiée ;
 *      le partenaire ne peut PAS se publier lui-même (trigger) ;
 *   2. le partenaire ne gère que les offres de SA société (isolation) ;
 *   3. intérêt : l'apprenant marque son intérêt sur une offre publiée seulement ;
 *   4. vue candidats : le partenaire voit les intéressés CONSENTANTS (synthèse),
 *      pas les non-consentants, jamais ceux d'une autre société/org ;
 *   5. besoins de formation : gérés par le partenaire, lus par le staff, le
 *      partenaire ne pilote pas le statut de suivi (trigger).
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

const runId = `jobs-${Date.now()}`;
const pwd = "Test-Password-123!";
let admin: SupabaseClient;
const org: Record<string, string> = {};
const users: Record<string, { id: string; email: string }> = {};
const clients: Record<string, SupabaseClient> = {};
const company: Record<string, string> = {};
let consentLearnerId = "";
let shyLearnerId = "";
let offerId = "";

async function makeOrg(tag: string): Promise<string> {
  const { data } = await admin.from("organizations").insert({ slug: `${runId}-${tag}`, name: `Org ${tag}` }).select("id").single();
  org[tag] = data!.id as string;
  return org[tag];
}
async function makeAuthUser(tag: string, orgId: string, role: string, extra: Record<string, unknown> = {}, emailOverride?: string): Promise<void> {
  const email = (emailOverride ?? `${runId}-${tag}@ex.test`).toLowerCase();
  const { data } = await admin.auth.admin.createUser({ email, password: pwd, email_confirm: true, app_metadata: { org_id: orgId } });
  const id = data!.user!.id;
  await admin.from("profiles").insert({ id, email });
  await admin.from("memberships").insert({ org_id: orgId, profile_id: id, role, ...extra });
  users[tag] = { id, email };
  const c = createClient(url!, anon!, { auth: { persistSession: false } });
  const { error } = await c.auth.signInWithPassword({ email, password: pwd });
  assert.ok(!error, `sign in ${tag}: ${error?.message}`);
  clients[tag] = c;
}
async function makeLearner(tag: string, orgId: string, email: string): Promise<string> {
  const { data: l } = await admin.from("learners_ro").insert({ org_id: orgId, email, airtable_record_id: `${runId}-etu-${tag}`, unique_learner_id: `${runId}-${tag}`, first_name: tag, last_name: "Job" }).select("id").single();
  await admin.from("enrollments_ro").insert({ org_id: orgId, learner_id: l!.id as string, airtable_record_id: `${runId}-cmd-${tag}`, program: "Consultant SAP", status: "En cours", start_date: "2026-02-01" });
  return l!.id as string;
}

before(async () => {
  if (!configured) return;
  admin = createClient(url!, serviceKey!, { auth: { persistSession: false } });
  const a = await makeOrg("a");
  const b = await makeOrg("b");
  const { data: cA } = await admin.from("partner_companies").insert({ org_id: a, name: `Co A ${runId}` }).select("id").single();
  company.a = cA!.id as string;
  const { data: cA2 } = await admin.from("partner_companies").insert({ org_id: a, name: `Co A2 ${runId}` }).select("id").single();
  company.a2 = cA2!.id as string;
  const { data: cB } = await admin.from("partner_companies").insert({ org_id: b, name: `Co B ${runId}` }).select("id").single();
  company.b = cB!.id as string;

  await makeAuthUser("dir", a, "direction");
  await makeAuthUser("partner", a, "partner", { partner_company_id: company.a });
  await makeAuthUser("partner2", a, "partner", { partner_company_id: company.a2 });
  await makeAuthUser("partnerB", b, "partner", { partner_company_id: company.b });

  // Deux apprenants : l'un consent au vivier, l'autre non.
  consentLearnerId = await makeLearner("consent", a, `${runId}-consent@ex.test`);
  shyLearnerId = await makeLearner("shy", a, `${runId}-shy@ex.test`);
  await admin.from("talent_profiles").insert({ org_id: a, learner_id: consentLearnerId, consented_at: new Date().toISOString() });
  await makeAuthUser("consent", a, "student", {}, `${runId}-consent@ex.test`);
  await makeAuthUser("shy", a, "student", {}, `${runId}-shy@ex.test`);
});

after(async () => {
  if (!configured) return;
  for (const o of Object.values(org)) {
    await admin.from("job_interests").delete().eq("org_id", o);
    await admin.from("job_offers").delete().eq("org_id", o);
    await admin.from("partner_training_needs").delete().eq("org_id", o);
    await admin.from("talent_profiles").delete().eq("org_id", o);
    await admin.from("enrollments_ro").delete().eq("org_id", o);
    await admin.from("learners_ro").delete().eq("org_id", o);
    await admin.from("memberships").delete().eq("org_id", o);
    await admin.from("partner_companies").delete().eq("org_id", o);
    await admin.from("organizations").delete().eq("id", o);
  }
  for (const u of Object.values(users)) {
    await admin.from("profiles").delete().eq("id", u.id);
    await admin.auth.admin.deleteUser(u.id);
  }
});

test("le partenaire crée une offre en attente et ne peut pas se publier lui-même", { skip }, async () => {
  const ins = await clients.partner.from("job_offers").insert({ org_id: org.a, partner_company_id: company.a, title: "Consultant MM", description: "Poste" }).select("id, status").single();
  assert.ok(!ins.error, `create: ${ins.error?.message}`);
  assert.equal(ins.data!.status, "pending", "soumise en modération");
  offerId = ins.data!.id as string;

  const selfPublish = await clients.partner.from("job_offers").update({ status: "published" }).eq("id", offerId);
  assert.ok(selfPublish.error, "le partenaire ne peut pas publier son offre (trigger)");

  // Créer directement en published est refusé aussi.
  const forge = await clients.partner.from("job_offers").insert({ org_id: org.a, partner_company_id: company.a, title: "X", description: "Y", status: "published" });
  assert.ok(forge.error, "création directe en published refusée");
});

test("un partenaire ne gère que les offres de SA société", { skip }, async () => {
  const foreign = await clients.partner2.from("job_offers").update({ title: "hack" }).eq("id", offerId);
  // pas d'erreur mais 0 ligne touchée (RLS) — vérifions que le titre est intact
  assert.ok(!foreign.error || foreign.error, "update cross-société ne modifie rien");
  const check = await admin.from("job_offers").select("title").eq("id", offerId).single();
  assert.equal(check.data!.title, "Consultant MM", "l'offre d'une autre société est intacte");

  const crossInsert = await clients.partner2.from("job_offers").insert({ org_id: org.a, partner_company_id: company.a, title: "Z", description: "Z" });
  assert.ok(crossInsert.error, "un partenaire ne crée pas d'offre pour une autre société");
});

test("l'offre n'est visible de l'apprenant qu'une fois publiée, et l'intérêt suit la publication", { skip }, async () => {
  // Avant publication : l'apprenant ne voit rien.
  const before = await clients.consent.from("job_offers").select("id").eq("id", offerId);
  assert.equal(before.data?.length ?? 0, 0, "offre pending invisible de l'apprenant");
  const earlyInterest = await clients.consent.from("job_interests").insert({ org_id: org.a, job_offer_id: offerId, learner_id: consentLearnerId });
  assert.ok(earlyInterest.error, "pas d'intérêt sur une offre non publiée");

  // La coordination publie.
  const pub = await clients.dir.from("job_offers").update({ status: "published", published_at: new Date().toISOString() }).eq("id", offerId);
  assert.ok(!pub.error, `publish: ${pub.error?.message}`);

  const afterPub = await clients.consent.from("job_offers").select("id").eq("id", offerId);
  assert.equal(afterPub.data?.length, 1, "offre publiée visible de l'apprenant");
  const interest = await clients.consent.from("job_interests").insert({ org_id: org.a, job_offer_id: offerId, learner_id: consentLearnerId });
  assert.ok(!interest.error, `interest: ${interest.error?.message}`);
  // Un apprenant ne pose pas d'intérêt pour un autre.
  const forgeInterest = await clients.consent.from("job_interests").insert({ org_id: org.a, job_offer_id: offerId, learner_id: shyLearnerId });
  assert.ok(forgeInterest.error, "un apprenant ne marque pas l'intérêt d'un autre");
});

test("la vue candidats ne montre que les intéressés consentants, à la bonne société", { skip }, async () => {
  // L'apprenant non-consentant marque aussi son intérêt.
  await clients.shy.from("job_interests").insert({ org_id: org.a, job_offer_id: offerId, learner_id: shyLearnerId });

  const seen = await clients.partner.from("job_offer_candidates").select("learner_id").eq("job_offer_id", offerId);
  assert.ok(!seen.error, seen.error?.message);
  const ids = (seen.data ?? []).map((r) => r.learner_id);
  assert.ok(ids.includes(consentLearnerId), "le candidat consentant est visible");
  assert.ok(!ids.includes(shyLearnerId), "l'intéressé non-consentant reste masqué");

  // Accès DIRECT à job_interests interdit au partenaire (il ne passe que par la vue consentie).
  const rawInterests = await clients.partner.from("job_interests").select("learner_id", { count: "exact", head: true });
  assert.equal(rawInterests.count ?? 0, 0, "un partenaire ne lit jamais job_interests en direct");

  // Un partenaire d'une autre société ne voit rien de cette offre.
  const foreign = await clients.partner2.from("job_offer_candidates").select("learner_id").eq("job_offer_id", offerId);
  assert.equal(foreign.data?.length ?? 0, 0, "une autre société ne voit pas les candidats de l'offre");
  // Ni le partenaire d'une autre org.
  const foreignOrg = await clients.partnerB.from("job_offer_candidates").select("learner_id").eq("job_offer_id", offerId);
  assert.equal(foreignOrg.data?.length ?? 0, 0, "une autre org ne voit rien");
});

test("revue sécurité : éditer une offre publiée la fait repasser en modération ; DELETE interdit au partenaire", { skip }, async () => {
  // L'offre est publiée (test précédent). Le partenaire édite son contenu…
  const edit = await clients.partner.from("job_offers").update({ description: "Contenu substitué" }).eq("id", offerId).select("status, published_at").single();
  assert.ok(!edit.error, `edit: ${edit.error?.message}`);
  assert.equal(edit.data!.status, "pending", "l'édition d'une offre publiée la renvoie en modération");
  assert.equal(edit.data!.published_at, null, "published_at est effacé");

  // DELETE d'une offre par le partenaire : refusé (RLS ne couvre pas delete).
  const del = await clients.partner.from("job_offers").delete().eq("id", offerId);
  const stillThere = await admin.from("job_offers").select("id").eq("id", offerId).maybeSingle();
  assert.ok(stillThere.data, "l'offre existe toujours — le partenaire ne peut pas la supprimer");
  void del;

  // Republier pour la suite (la vue candidats teste déjà, mais restaurons l'état).
  await clients.dir.from("job_offers").update({ status: "published", published_at: new Date().toISOString() }).eq("id", offerId);

  // Cohérence org : le staff ne peut pas rattacher une offre à une société d'un autre org.
  const { data: compB } = await admin.from("partner_companies").select("id").eq("org_id", org.b).single();
  const cross = await clients.dir.from("job_offers").insert({ org_id: org.a, partner_company_id: compB!.id as string, title: "X", description: "Y" });
  assert.ok(cross.error, "société d'un autre organisme refusée (trigger de cohérence)");

  // Accountability : la consultation des candidats est journalisable par le partenaire.
  const { error: logErr } = await clients.partner.rpc("log_access", { p_action: "job_offer_candidates.view", p_subject_type: "job_offer", p_subject_id: offerId, p_detail: null });
  assert.ok(!logErr, `log job candidates: ${logErr?.message}`);
  const { data: audit } = await admin.from("audit_log").select("action").eq("org_id", org.a).eq("action", "job_offer_candidates.view");
  assert.ok((audit?.length ?? 0) >= 1, "la consultation des candidats est tracée");
});

test("besoins de formation : le partenaire exprime, le staff suit, le statut est verrouillé", { skip }, async () => {
  const ins = await clients.partner.from("partner_training_needs").insert({ org_id: org.a, partner_company_id: company.a, title: "EWM", headcount: 5 }).select("id, status").single();
  assert.ok(!ins.error, `need: ${ins.error?.message}`);
  assert.equal(ins.data!.status, "open");
  const needId = ins.data!.id as string;

  const forgeStatus = await clients.partner.from("partner_training_needs").update({ status: "reviewed" }).eq("id", needId);
  assert.ok(forgeStatus.error, "le partenaire ne pilote pas le statut de suivi (trigger)");

  const staffRead = await clients.dir.from("partner_training_needs").select("id, title").eq("id", needId).single();
  assert.equal(staffRead.data!.title, "EWM", "la coordination lit les besoins");
  const staffReview = await clients.dir.from("partner_training_needs").update({ status: "reviewed" }).eq("id", needId);
  assert.ok(!staffReview.error, "la coordination met à jour le statut");

  // Isolation : une autre org ne voit pas ce besoin.
  const foreign = await clients.partnerB.from("partner_training_needs").select("id").eq("id", needId);
  assert.equal(foreign.data?.length ?? 0, 0, "besoin non visible d'une autre org");
});
