/**
 * Opérations pédagogiques — integration test (INC-3, Module 1 / S1.1).
 *
 * Proves the priorized-queue predicates on real RLS, on a disposable org:
 *   - server-access alert window (≤ 30 days) surfaces the right dossiers and
 *     excludes finished ones and those beyond the window;
 *   - late-learner and pending-report lists exclude finished dossiers and order
 *     by urgency;
 *   - an upcoming defense with no jury is surfaced as "à compléter";
 *   - RLS narrows the queue for a coach to their own dossiers.
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

const runId = `ops-${Date.now()}`;
const pwd = "Test-Password-123!";
const PROGRAM = "Prog-" + runId;
const EXCLUDE_FINISHED = "status.is.null,status.neq.Terminé";
let admin: SupabaseClient;
let orgId = "";
const users: Record<string, { id: string; email: string }> = {};
const enr: Record<string, string> = {}; // tag → enrollment id
let coachEmail = "";

const dateOnly = (d: Date) => d.toISOString().slice(0, 10);
const inDays = (n: number) => dateOnly(new Date(Date.now() + n * 86_400_000));

async function makeUser(tag: string, role: string): Promise<string> {
  const email = `${runId}-${tag}@example.test`;
  const { data } = await admin.auth.admin.createUser({ email, password: pwd, email_confirm: true, app_metadata: { org_id: orgId } });
  const id = data!.user!.id;
  await admin.from("profiles").insert({ id, email });
  await admin.from("memberships").insert({ org_id: orgId, profile_id: id, role });
  users[tag] = { id, email };
  return email;
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
  const { data: org } = await admin.from("organizations").insert({ slug: runId, name: `Org ${runId}` }).select("id").single();
  orgId = org!.id as string;

  coachEmail = await makeUser("coach", "coach");
  await makeUser("dir", "direction");

  const { data: l } = await admin.from("learners_ro").insert({
    org_id: orgId, airtable_record_id: `${runId}-l`, unique_learner_id: `${runId}-l`,
    first_name: "Lea", last_name: "Test", email: `${runId}-learner@example.test`,
  }).select("id").single();
  const learnerId = l!.id as string;
  const otherCoach = `${runId}-other-coach@example.test`;

  // Dossiers with distinct operational states. Only E1 is coached by our coach.
  const rows = [
    { tag: "e1", status: "En cours", late_days: 12, access_end_date: inDays(5), pending_reports: 2, coach_email: coachEmail },
    { tag: "e2", status: "En cours", late_days: 0, access_end_date: inDays(20), pending_reports: 0, coach_email: otherCoach },
    { tag: "e3", status: "Terminé", late_days: 30, access_end_date: inDays(3), pending_reports: 5, coach_email: otherCoach },
    { tag: "e4", status: "En cours", late_days: 0, access_end_date: inDays(60), pending_reports: 0, coach_email: otherCoach },
    { tag: "e5", status: "En cours", late_days: 0, access_end_date: null, pending_reports: 3, coach_email: otherCoach },
  ];
  for (const r of rows) {
    const { data } = await admin.from("enrollments_ro").insert({
      org_id: orgId, airtable_record_id: `${runId}-${r.tag}`, learner_id: learnerId, program: PROGRAM,
      status: r.status, late_days: r.late_days, access_end_date: r.access_end_date, pending_reports: r.pending_reports,
      coach_email: r.coach_email,
    }).select("id").single();
    enr[r.tag] = data!.id as string;
  }

  // Upcoming defense on E1 (deliverable submitted to pass the gate), no jury yet.
  await admin.from("project_deliverables").insert({
    org_id: orgId, enrollment_id: enr.e1, project_number: 1, deliverable_submitted: true,
  });
  await admin.from("reservations").insert({
    org_id: orgId, learner_id: learnerId, enrollment_id: enr.e1, kind: "defense", project_number: 1,
    starts_at: new Date(Date.now() + 2 * 86_400_000).toISOString(),
    ends_at: new Date(Date.now() + 2 * 86_400_000 + 3_600_000).toISOString(), status: "pending",
  });
});

after(async () => {
  if (!configured || !orgId) return;
  await admin.from("reservation_evaluators").delete().eq("org_id", orgId);
  await admin.from("reservations").delete().eq("org_id", orgId);
  await admin.from("project_deliverables").delete().eq("org_id", orgId);
  await admin.from("enrollments_ro").delete().eq("org_id", orgId);
  await admin.from("learners_ro").delete().eq("org_id", orgId);
  await admin.from("organizations").delete().eq("id", orgId); // cascades memberships
  for (const u of Object.values(users)) {
    await admin.from("profiles").delete().eq("id", u.id);
    await admin.auth.admin.deleteUser(u.id);
  }
});

test("server-access alert (≤30 days) surfaces active dossiers, excludes finished & out-of-window", { skip }, async () => {
  const dir = await signIn("dir");
  const { data } = await dir.from("enrollments_ro")
    .select("id, access_end_date")
    .eq("org_id", orgId)
    .gte("access_end_date", dateOnly(new Date()))
    .lte("access_end_date", dateOnly(new Date(Date.now() + 30 * 86_400_000)))
    .or(EXCLUDE_FINISHED);
  const ids = new Set((data ?? []).map((r) => r.id));
  assert.ok(ids.has(enr.e1), "E1 (+5d) is in the window");
  assert.ok(ids.has(enr.e2), "E2 (+20d) is in the window");
  assert.ok(!ids.has(enr.e3), "E3 is finished → excluded");
  assert.ok(!ids.has(enr.e4), "E4 (+60d) is beyond the window");
  assert.ok(!ids.has(enr.e5), "E5 has no access date → excluded");
});

test("late-learner list excludes finished dossiers and orders by delay", { skip }, async () => {
  const dir = await signIn("dir");
  const { data } = await dir.from("enrollments_ro")
    .select("id, late_days")
    .eq("org_id", orgId)
    .gt("late_days", 0)
    .or(EXCLUDE_FINISHED)
    .order("late_days", { ascending: false });
  const ids = (data ?? []).map((r) => r.id);
  assert.deepEqual(ids, [enr.e1], "only E1 is late and active (E3 is finished)");
});

test("pending-reports list excludes finished dossiers, most first", { skip }, async () => {
  const dir = await signIn("dir");
  const { data } = await dir.from("enrollments_ro")
    .select("id, pending_reports")
    .eq("org_id", orgId)
    .gt("pending_reports", 0)
    .or(EXCLUDE_FINISHED)
    .order("pending_reports", { ascending: false });
  const ids = (data ?? []).map((r) => r.id);
  assert.deepEqual(ids, [enr.e5, enr.e1], "E5(3) before E1(2); E3 finished is excluded");
});

test("an upcoming defense with no jury is surfaced as to-complete", { skip }, async () => {
  const dir = await signIn("dir");
  const { data } = await dir.from("reservations")
    .select("id, status, evaluators:reservation_evaluators(evaluator_id)")
    .eq("org_id", orgId)
    .eq("kind", "defense")
    .gte("starts_at", new Date().toISOString())
    .in("status", ["pending", "confirmed"]);
  assert.equal(data?.length, 1, "the upcoming defense is listed");
  assert.equal((data![0].evaluators as unknown[]).length, 0, "no jury yet → needs assignment");
});

test("RLS narrows the queue for a coach to their own dossiers", { skip }, async () => {
  const coach = await signIn("coach");
  const { data } = await coach.from("enrollments_ro")
    .select("id")
    .eq("org_id", orgId)
    .or(EXCLUDE_FINISHED);
  const ids = new Set((data ?? []).map((r) => r.id));
  assert.ok(ids.has(enr.e1), "coach sees their own dossier E1");
  assert.ok(!ids.has(enr.e2), "coach does not see other coaches' dossiers");
  assert.ok(!ids.has(enr.e5), "coach does not see other coaches' dossiers");
});
