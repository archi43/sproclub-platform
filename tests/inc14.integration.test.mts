/**
 * INC-14 — Fillout → coaching_reports et write-back Airtable (mappings).
 *
 * Prouve, contre la vraie base (org jetable) :
 *   1. normalizeSubmission : extraction e-mail / note / corps (pur) ;
 *   2. buildCrFields : champs Airtable exacts du write-back (pur, AUCUN appel
 *      Airtable — le POST réel est gated par AIRTABLE_WRITEBACK_ENABLED) ;
 *   3. syncFillout : rattachement par e-mail au dossier le plus récent,
 *      soumissions inconnues comptées (pas de perte silencieuse), idempotence.
 * Se saute sans env Supabase (même convention que les autres suites).
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { normalizeSubmission } from "../src/lib/sync/fillout-source.ts";
import { syncFillout } from "../src/lib/sync/fillout.ts";
import { buildCrFields } from "../src/lib/sync/airtable-writeback.ts";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const configured = !!url && !!serviceKey && !url.includes("placeholder") && !serviceKey.includes("placeholder");
const skip = !configured && "Supabase env not configured";

const runId = `inc14-${Date.now()}`;
let admin: SupabaseClient;
let orgId = "";
let newestEnrollmentId = "";

before(async () => {
  if (!configured) return;
  admin = createClient(url!, serviceKey!, { auth: { persistSession: false } });
  const { data: org } = await admin.from("organizations").insert({ slug: runId, name: `Org ${runId}` }).select("id").single();
  orgId = org!.id as string;

  const { data: learner } = await admin
    .from("learners_ro")
    .insert({ org_id: orgId, airtable_record_id: `${runId}-rec`, unique_learner_id: runId, email: `${runId}-alice@exemple.test`, first_name: "Alice", last_name: "Test" })
    .select("id")
    .single();
  const learnerId = learner!.id as string;

  // Deux dossiers : le plus récent doit être choisi par syncFillout.
  const { data: older } = await admin
    .from("enrollments_ro")
    .insert({ org_id: orgId, airtable_record_id: `${runId}-old`, learner_id: learnerId, program: "Ancien", start_date: "2024-01-01" })
    .select("id")
    .single();
  assert.ok(older);
  const { data: newer } = await admin
    .from("enrollments_ro")
    .insert({ org_id: orgId, airtable_record_id: `${runId}-new`, learner_id: learnerId, program: "Récent", start_date: "2026-01-01" })
    .select("id")
    .single();
  newestEnrollmentId = newer!.id as string;
});

after(async () => {
  if (!configured || !orgId) return;
  await admin.from("coaching_reports").delete().eq("org_id", orgId);
  await admin.from("enrollments_ro").delete().eq("org_id", orgId);
  await admin.from("learners_ro").delete().eq("org_id", orgId);
  await admin.from("organizations").delete().eq("id", orgId);
});

test("normalizeSubmission extrait e-mail, note et corps", () => {
  const s = normalizeSubmission({
    submissionId: "sub-test-1",
    submissionTime: "2026-07-10T09:30:00.000Z",
    questions: [
      { name: "Votre e-mail", type: "EmailInput", value: "Alice@Exemple.TEST" },
      { name: "Note de la séance", type: "NumberInput", value: 3.5 },
      { name: "Commentaire", type: "LongAnswer", value: "Très bonne progression" },
      { name: "Vide", type: "ShortAnswer", value: "" },
    ],
  });
  assert.equal(s.email, "alice@exemple.test");
  assert.equal(s.grade, 3.5);
  assert.match(s.body, /Commentaire : Très bonne progression/);
  assert.doesNotMatch(s.body, /Vide/);
});

test("buildCrFields produit les champs Airtable attendus", () => {
  const fields = buildCrFields(
    { session_date: "2026-07-10", created_at: "2026-07-11T08:00:00Z", body: "CR de séance", grade: 3, source: "platform" },
    { commandeRecordId: "recAAAABBBBCCCCDD", learnerName: "Alice Test" }
  );
  assert.equal(fields["Date épreuve"], "2026-07-10");
  assert.match(String(fields["Commentaires"]), /CR de séance/);
  assert.match(String(fields["Commentaires"]), /Note : 3\/4/);
  assert.equal(fields["Prénom & Nom Candidat"], "Alice Test");
  assert.deepEqual(fields["Sales Orders-header"], ["recAAAABBBBCCCCDD"]);
  assert.equal(fields["Situation d'évaluation"], "Coaching — plateforme SproCLUB");
});

test("syncFillout rattache au dossier le plus récent, compte les inconnues, idempotent", { skip }, async () => {
  const submissions = [
    { submissionId: `${runId}-s1`, submittedAt: "2026-07-10T10:00:00.000Z", email: `${runId}-alice@exemple.test`, grade: 4, body: "Évaluation Fillout" },
    { submissionId: `${runId}-s2`, submittedAt: "2026-07-10T11:00:00.000Z", email: "inconnu@exemple.test", body: "Sans dossier" },
    { submissionId: `${runId}-s3`, submittedAt: "2026-07-10T12:00:00.000Z", email: undefined, body: "Sans e-mail" },
  ];

  const first = await syncFillout(admin, orgId, submissions);
  assert.equal(first.inserted, 1);
  assert.equal(first.skippedUnknownEmail, 1);
  assert.equal(first.skippedNoEmail, 1);

  const second = await syncFillout(admin, orgId, submissions); // rejouer = aucun doublon
  assert.equal(second.inserted, 1); // upsert ignoreDuplicates : même ligne, pas de copie

  const { data: rows } = await admin
    .from("coaching_reports")
    .select("enrollment_id, source, grade, airtable_synced")
    .eq("org_id", orgId);
  assert.equal(rows!.length, 1, "une seule ligne après deux runs");
  assert.equal(rows![0].enrollment_id, newestEnrollmentId, "rattachée au dossier le plus récent");
  assert.equal(rows![0].source, "fillout");
  assert.equal(rows![0].grade, 4);
  assert.equal(rows![0].airtable_synced, false, "en attente de write-back");
});
