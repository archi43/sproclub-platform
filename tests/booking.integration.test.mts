/**
 * Booking invariants — integration test.
 *
 * Proves the pilot's non-negotiable defense (soutenance) rules are enforced by
 * the DATABASE (triggers in migration 0004), so no client can bypass them:
 *   1. a defense cannot be booked before the project deliverable is submitted;
 *   2. the referent coach can never be part of the jury;
 *   3. a defense confirms only with exactly two evaluators;
 *   4. a jury has at most two evaluators.
 *
 * Uses the service-role client: it bypasses RLS but NOT triggers, which is
 * exactly what we want to test. Skips when Supabase env is not configured.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const configured =
  !!url && !!serviceKey && !url.includes("placeholder") && !serviceKey.includes("placeholder");
const skip = !configured && "Supabase env not configured";

const runId = `bkg-${Date.now()}`;
const PROGRAM = `Program ${runId}`;

let admin: SupabaseClient;
const ctx = {
  orgId: "",
  coachId: "",
  eval1: "",
  eval2: "",
  eval3: "",
  coachEmail: "",
  enrollmentId: "",
  learnerId: "",
  reservationId: "",
};

async function makeUser(tag: string): Promise<{ id: string; email: string }> {
  const email = `${runId}-${tag}@example.test`;
  const { data, error } = await admin.auth.admin.createUser({ email, email_confirm: true });
  assert.ok(!error, `create ${tag}: ${error?.message}`);
  const id = data!.user!.id;
  await admin.from("profiles").insert({ id, email });
  return { id, email };
}

before(async () => {
  if (!configured) return;
  admin = createClient(url!, serviceKey!, { auth: { persistSession: false } });

  const { data: org } = await admin
    .from("organizations")
    .insert({ slug: runId, name: `Org ${runId}` })
    .select("id")
    .single();
  ctx.orgId = org!.id as string;

  const coach = await makeUser("coach");
  ctx.coachId = coach.id;
  ctx.coachEmail = coach.email;
  ctx.eval1 = (await makeUser("eval1")).id;
  ctx.eval2 = (await makeUser("eval2")).id;
  ctx.eval3 = (await makeUser("eval3")).id;

  // Evaluator pool for the program (coach intentionally NOT in the pool).
  for (const id of [ctx.eval1, ctx.eval2, ctx.eval3]) {
    await admin.from("evaluator_pool").insert({ org_id: ctx.orgId, program: PROGRAM, evaluator_id: id });
  }

  const { data: learner } = await admin
    .from("learners_ro")
    .insert({
      org_id: ctx.orgId,
      airtable_record_id: `${runId}-rec`,
      unique_learner_id: `${runId}-uid`,
      email: `${runId}-student@example.test`,
    })
    .select("id")
    .single();
  ctx.learnerId = learner!.id as string;

  const { data: enr } = await admin
    .from("enrollments_ro")
    .insert({
      org_id: ctx.orgId,
      airtable_record_id: `${runId}-enr`,
      learner_id: ctx.learnerId,
      program: PROGRAM,
      status: "active",
      coach_email: ctx.coachEmail, // referent coach
    })
    .select("id")
    .single();
  ctx.enrollmentId = enr!.id as string;

  // Project 1 deliverable exists but is NOT yet submitted.
  await admin.from("project_deliverables").insert({
    org_id: ctx.orgId,
    enrollment_id: ctx.enrollmentId,
    project_number: 1,
    deliverable_submitted: false,
  });
});

after(async () => {
  if (!configured || !admin) return;
  await admin.from("reservation_evaluators").delete().eq("org_id", ctx.orgId);
  await admin.from("reservations").delete().eq("org_id", ctx.orgId);
  await admin.from("project_deliverables").delete().eq("org_id", ctx.orgId);
  await admin.from("evaluator_pool").delete().eq("org_id", ctx.orgId);
  await admin.from("enrollments_ro").delete().eq("org_id", ctx.orgId);
  await admin.from("learners_ro").delete().eq("org_id", ctx.orgId);
  await admin.from("organizations").delete().eq("id", ctx.orgId);
  for (const id of [ctx.coachId, ctx.eval1, ctx.eval2, ctx.eval3]) {
    if (!id) continue;
    await admin.from("profiles").delete().eq("id", id);
    await admin.auth.admin.deleteUser(id);
  }
});

function defenseRow() {
  return {
    org_id: ctx.orgId,
    learner_id: ctx.learnerId,
    enrollment_id: ctx.enrollmentId,
    kind: "defense" as const,
    project_number: 1,
    starts_at: "2027-01-10T09:00:00Z",
    ends_at: "2027-01-10T10:00:00Z",
  };
}

test("a defense cannot be booked before the deliverable is submitted", { skip }, async () => {
  const { error } = await admin.from("reservations").insert(defenseRow());
  assert.ok(error, "insert must be rejected while deliverable is not submitted");
});

test("once the deliverable is submitted, the defense can be booked", { skip }, async () => {
  await admin
    .from("project_deliverables")
    .update({ deliverable_submitted: true, submitted_at: "2027-01-01T00:00:00Z" })
    .eq("enrollment_id", ctx.enrollmentId)
    .eq("project_number", 1);

  const { data, error } = await admin.from("reservations").insert(defenseRow()).select("id").single();
  assert.ok(!error, `booking should succeed: ${error?.message}`);
  ctx.reservationId = data!.id as string;
});

test("the referent coach can never join the jury", { skip }, async () => {
  const { error } = await admin
    .from("reservation_evaluators")
    .insert({ org_id: ctx.orgId, reservation_id: ctx.reservationId, evaluator_id: ctx.coachId });
  assert.ok(error, "adding the referent coach as evaluator must be rejected");
});

test("a defense confirms only with exactly two evaluators", { skip }, async () => {
  // One evaluator so far → confirmation must fail.
  await admin
    .from("reservation_evaluators")
    .insert({ org_id: ctx.orgId, reservation_id: ctx.reservationId, evaluator_id: ctx.eval1 });

  const one = await admin.from("reservations").update({ status: "confirmed" }).eq("id", ctx.reservationId);
  assert.ok(one.error, "confirmation with a single evaluator must be rejected");

  // Second evaluator → confirmation succeeds.
  await admin
    .from("reservation_evaluators")
    .insert({ org_id: ctx.orgId, reservation_id: ctx.reservationId, evaluator_id: ctx.eval2 });

  const two = await admin.from("reservations").update({ status: "confirmed" }).eq("id", ctx.reservationId);
  assert.ok(!two.error, `confirmation with two evaluators should succeed: ${two.error?.message}`);
});

test("a jury has at most two evaluators", { skip }, async () => {
  const { error } = await admin
    .from("reservation_evaluators")
    .insert({ org_id: ctx.orgId, reservation_id: ctx.reservationId, evaluator_id: ctx.eval3 });
  assert.ok(error, "a third evaluator must be rejected");
});
