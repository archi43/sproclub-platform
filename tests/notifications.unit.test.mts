/**
 * Notification rules (INC-7), pure — tested off-DB. Proves the due-reminder
 * selection windows and the STABLE dedupe keys the cron relies on for idempotency.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildDueNotifications, type NotificationInputs } from "../src/lib/notification-rules.ts";

const today = new Date("2026-07-10T09:00:00Z");
const inDays = (n: number) => new Date(today.getTime() + n * 86_400_000).toISOString();
const empty: NotificationInputs = { defenses: [], servers: [], reports: [] };

test("a defense within 3 days triggers one reminder to the learner", () => {
  const out = buildDueNotifications({ ...empty, defenses: [
    { reservationId: "r1", learnerEmail: "lea@ex.test", learnerName: "Léa", program: "P", startsAt: inDays(2) },
  ] }, today);
  assert.equal(out.length, 1);
  assert.equal(out[0].kind, "defense_reminder");
  assert.equal(out[0].recipientEmail, "lea@ex.test");
  // Dedupe key carries the date so a reschedule re-triggers a fresh reminder.
  assert.equal(out[0].dedupeKey, `defense_reminder:r1:${inDays(2).slice(0, 10)}`);
});

test("a defense further than 3 days away, or already past, is not reminded", () => {
  const out = buildDueNotifications({ ...empty, defenses: [
    { reservationId: "r2", learnerEmail: "a@ex.test", learnerName: "A", program: null, startsAt: inDays(5) },
    { reservationId: "r3", learnerEmail: "b@ex.test", learnerName: "B", program: null, startsAt: inDays(-1) },
  ] }, today);
  assert.equal(out.length, 0);
});

test("a server access ending within 7 days triggers a learner reminder keyed by end-date", () => {
  const out = buildDueNotifications({ ...empty, servers: [
    { enrollmentId: "e1", learnerEmail: "lea@ex.test", learnerName: "Léa", accessEndDate: "2026-07-15", daysLeft: 5 },
    { enrollmentId: "e2", learnerEmail: "z@ex.test", learnerName: "Z", accessEndDate: "2026-07-30", daysLeft: 20 },
  ] }, today);
  assert.equal(out.length, 1);
  assert.equal(out[0].kind, "server_access_ending");
  assert.equal(out[0].dedupeKey, "server_access_ending:e1:2026-07-15");
});

test("pending reports remind the coach (monthly bucket); no coach = no reminder", () => {
  const out = buildDueNotifications({ ...empty, reports: [
    { enrollmentId: "e1", coachEmail: "coach@ex.test", learnerName: "Léa", pendingReports: 2 },
    { enrollmentId: "e2", coachEmail: null, learnerName: "Sans coach", pendingReports: 3 },
  ] }, today);
  assert.equal(out.length, 1);
  assert.equal(out[0].kind, "report_pending");
  assert.equal(out[0].recipientEmail, "coach@ex.test");
  assert.equal(out[0].dedupeKey, "report_pending:e1:2026-07");
});

test("recipients with an empty address are dropped", () => {
  const out = buildDueNotifications({ ...empty, defenses: [
    { reservationId: "r1", learnerEmail: "", learnerName: "No mail", program: null, startsAt: inDays(1) },
  ] }, today);
  assert.equal(out.length, 0);
});
