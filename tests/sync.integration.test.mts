/**
 * Airtable → Postgres sync — integration test (INC-1).
 *
 * Proves the sync's two guarantees against a real database, on a disposable org:
 *   1. correct mapping (real buildLearner/buildEnrollment from the engine);
 *   2. idempotency — running twice creates no duplicates (learners deduped by
 *      e-mail, enrollments by source record id), thanks to the DB constraints.
 *
 * The upsert here mirrors src/lib/sync/run.ts using the SAME real builders and
 * the SAME conflict targets (0009 unique (org_id,email); airtable_record_id
 * unique). Airtable is never contacted (the source is a fixture). Skips without
 * Supabase env.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { buildLearner, buildEnrollment, normalizeEmail, SRC, type SourceRecord } from "../src/lib/sync/mapping.ts";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const configured = !!url && !!serviceKey && !url.includes("placeholder") && !serviceKey.includes("placeholder");
const skip = !configured && "Supabase env not configured";

const runId = `sync-${Date.now()}`;
let admin: SupabaseClient;
let orgId = "";

// Fixture: 3 "Commandes" — two share a learner e-mail (→ 1 learner), one other.
function fixture(): SourceRecord[] {
  const mk = (rec: string, etu: string, email: string, extra: Record<string, unknown>): SourceRecord => ({
    id: rec,
    fields: {
      [SRC.etudiant]: [etu],
      [SRC.email]: [email], // lookups arrive as arrays
      [SRC.prenom]: extra.prenom,
      [SRC.nom]: extra.nom,
      [SRC.programme]: extra.programme,
      [SRC.statut]: extra.statut,
      [SRC.financeur]: extra.financeur,
      [SRC.dateDebReelle]: extra.date,
      [SRC.coachEmail]: extra.coach ? [extra.coach] : undefined,
    },
  });
  return [
    mk(`${runId}-c1`, `${runId}-e1`, `${runId}-alice@EXEMPLE.fr`, { prenom: "Alice", nom: "A", programme: "Consultant ERP", statut: "3 - En cours", financeur: "CPF", date: "2026-09-01", coach: "COACH@Sproclub.test" }),
    mk(`${runId}-c2`, `${runId}-e1`, `${runId}-alice@exemple.fr`, { prenom: "Alice", nom: "A", programme: "Consultant ERP", statut: "Terminé", financeur: "Entreprise", date: "2027-01-01" }),
    mk(`${runId}-c3`, `${runId}-e2`, `${runId}-bob@exemple.fr`, { prenom: "Bob", nom: "B", programme: "Data", statut: "en cours", financeur: "France Travail", date: "2026-10-01" }),
  ];
}

/** Mirror of src/lib/sync/run.ts (same real builders + conflict targets). */
async function runSync(source: SourceRecord[]) {
  const now = new Date().toISOString();
  const byEmail = new Map<string, ReturnType<typeof buildLearner>>();
  for (const rec of source) {
    const l = buildLearner(rec);
    if (l) byEmail.set(l.email, l);
  }
  const learnerRows = [...byEmail.values()].map((l) => ({ ...l!, org_id: orgId, synced_at: now }));
  const up = await admin.from("learners_ro").upsert(learnerRows, { onConflict: "org_id,email" }).select("id, email");
  assert.ok(!up.error, `learners upsert: ${up.error?.message}`);
  const emailToId = new Map((up.data ?? []).map((r) => [r.email as string, r.id as string]));

  const enrollmentRows = source
    .map((rec) => {
      const email = normalizeEmail(rec.fields[SRC.email]);
      const learnerId = email ? emailToId.get(email) : undefined;
      return learnerId ? { ...buildEnrollment(rec), org_id: orgId, learner_id: learnerId, synced_at: now } : null;
    })
    .filter(Boolean) as Record<string, unknown>[];
  const en = await admin.from("enrollments_ro").upsert(enrollmentRows, { onConflict: "airtable_record_id" });
  assert.ok(!en.error, `enrollments upsert: ${en.error?.message}`);
}

async function counts() {
  const l = await admin.from("learners_ro").select("id", { count: "exact", head: true }).eq("org_id", orgId);
  const e = await admin.from("enrollments_ro").select("id", { count: "exact", head: true }).eq("org_id", orgId);
  return { learners: l.count ?? 0, enrollments: e.count ?? 0 };
}

before(async () => {
  if (!configured) return;
  admin = createClient(url!, serviceKey!, { auth: { persistSession: false } });
  const { data } = await admin.from("organizations").insert({ slug: runId, name: `Org ${runId}` }).select("id").single();
  orgId = data!.id as string;
});

after(async () => {
  if (!configured || !orgId) return;
  await admin.from("enrollments_ro").delete().eq("org_id", orgId);
  await admin.from("learners_ro").delete().eq("org_id", orgId);
  await admin.from("organizations").delete().eq("id", orgId);
});

test("first sync maps and deduplicates correctly", { skip }, async () => {
  await runSync(fixture());
  const c = await counts();
  assert.equal(c.learners, 2, "two distinct e-mails → two learners (deduped)");
  assert.equal(c.enrollments, 3, "three Commandes → three enrollments");

  // Mapping spot-checks on the shared learner + its enrollments.
  const alice = await admin.from("learners_ro").select("email, first_name, unique_learner_id").eq("org_id", orgId).eq("email", `${runId}-alice@exemple.fr`).single();
  assert.ok(!alice.error, "learner e-mail lower-cased & found");
  assert.equal(alice.data!.first_name, "Alice");

  const enr = await admin.from("enrollments_ro").select("program, status, financer, coach_email, start_date").eq("airtable_record_id", `${runId}-c1`).single();
  assert.equal(enr.data!.program, "Consultant ERP");
  assert.equal(enr.data!.status, "En cours"); // "3 - En cours" normalized
  assert.equal(enr.data!.financer, "CPF");
  assert.equal(enr.data!.coach_email, "coach@sproclub.test"); // lower-cased (0005)
  assert.equal(enr.data!.start_date, "2026-09-01");
});

test("second sync is idempotent (no duplicates)", { skip }, async () => {
  await runSync(fixture());
  const c = await counts();
  assert.equal(c.learners, 2, "still two learners after re-run");
  assert.equal(c.enrollments, 3, "still three enrollments after re-run");
});
