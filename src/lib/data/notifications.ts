import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { getMailer, type Mailer } from "@/lib/notifications/mailer";
import {
  buildDueNotifications,
  DEFENSE_REMINDER_DAYS,
  SERVER_REMINDER_DAYS,
  type DueNotification,
  type NotificationInputs,
} from "@/lib/notification-rules";

/**
 * Notifications & relances (INC-7). The cron GATHERS the due reminders from the
 * operational read-model (service role — it has no user session), ENQUEUES them
 * idempotently (unique dedupe_key), then DISPATCHES pending ones through the
 * mailer port. Degrades gracefully: with no mailer configured, notifications stay
 * `pending`. Recipient opt-outs (notification_prefs) are honoured. Staff read the
 * journal through RLS.
 */

const DAY = 86_400_000;
const dateOnly = (d: Date) => d.toISOString().slice(0, 10);
const excludeFinished = "status.is.null,status.neq.Terminé";
type LearnerEmbed = { first_name: string | null; last_name: string | null; email: string } | null;
const fullName = (l: LearnerEmbed) => [l?.first_name, l?.last_name].filter(Boolean).join(" ") || (l?.email ?? "—");

/** Kinds still handled by an active Airtable automation can be disabled here to
 *  avoid double-sending (env `NOTIF_DISABLED_KINDS`, comma-separated). */
function disabledKinds(): Set<string> {
  return new Set((process.env.NOTIF_DISABLED_KINDS ?? "").split(",").map((s) => s.trim()).filter(Boolean));
}

/** Read the operational inputs for one org with the service role (RLS bypassed by
 *  design; the explicit org_id filter is the scoping). */
export async function gatherInputs(orgId: string, admin: SupabaseClient, today: Date): Promise<NotificationInputs> {
  const horizonDefense = new Date(today.getTime() + (DEFENSE_REMINDER_DAYS + 1) * DAY).toISOString();
  const horizonServer = new Date(today.getTime() + SERVER_REMINDER_DAYS * DAY);

  const [defRes, srvRes, repRes] = await Promise.all([
    admin
      .from("reservations")
      .select("id, starts_at, enrollment:enrollments_ro(program), learner:learners_ro(first_name, last_name, email)")
      .eq("org_id", orgId)
      .eq("kind", "defense")
      .in("status", ["pending", "confirmed"])
      .gte("starts_at", today.toISOString())
      .lte("starts_at", horizonDefense),
    admin
      .from("enrollments_ro")
      .select("id, access_end_date, learner:learners_ro(first_name, last_name, email)")
      .eq("org_id", orgId)
      .gte("access_end_date", dateOnly(today))
      .lte("access_end_date", dateOnly(horizonServer))
      .or(excludeFinished),
    admin
      .from("enrollments_ro")
      .select("id, coach_email, pending_reports, learner:learners_ro(first_name, last_name, email)")
      .eq("org_id", orgId)
      .gt("pending_reports", 0)
      .not("coach_email", "is", null)
      .or(excludeFinished),
  ]);

  const start = Date.parse(dateOnly(today));
  return {
    defenses: ((defRes.data ?? []) as unknown as { id: string; starts_at: string; enrollment: { program: string | null } | null; learner: LearnerEmbed }[]).map((r) => ({
      reservationId: r.id,
      learnerEmail: r.learner?.email ?? "",
      learnerName: fullName(r.learner),
      program: r.enrollment?.program ?? null,
      startsAt: r.starts_at,
    })),
    servers: ((srvRes.data ?? []) as unknown as { id: string; access_end_date: string; learner: LearnerEmbed }[]).map((r) => ({
      enrollmentId: r.id,
      learnerEmail: r.learner?.email ?? "",
      learnerName: fullName(r.learner),
      accessEndDate: r.access_end_date,
      daysLeft: Math.round((Date.parse(r.access_end_date) - start) / DAY),
    })),
    reports: ((repRes.data ?? []) as unknown as { id: string; coach_email: string | null; pending_reports: number; learner: LearnerEmbed }[]).map((r) => ({
      enrollmentId: r.id,
      coachEmail: r.coach_email,
      learnerName: fullName(r.learner),
      pendingReports: r.pending_reports,
    })),
  };
}

/** Enqueue due notifications idempotently. Kinds disabled via env are skipped.
 *  Returns the number of NEW rows created (duplicates are ignored by the unique
 *  (org_id, dedupe_key) constraint). */
export async function enqueueNotifications(orgId: string, due: DueNotification[], admin: SupabaseClient): Promise<number> {
  const disabled = disabledKinds();
  const rows = due
    .filter((n) => !disabled.has(n.kind))
    .map((n) => ({
      org_id: orgId,
      kind: n.kind,
      recipient_email: n.recipientEmail.toLowerCase(),
      subject: n.subject,
      body: n.body,
      dedupe_key: n.dedupeKey,
    }));
  if (rows.length === 0) return 0;
  const { data, error } = await admin
    .from("notifications")
    .upsert(rows, { onConflict: "org_id,dedupe_key", ignoreDuplicates: true })
    .select("id");
  if (error) throw new Error(`enqueue failed: ${error.message}`);
  return (data ?? []).length;
}

export interface DispatchSummary {
  sent: number;
  skipped: number;
  errors: number;
  pending: number;
  mailerConfigured: boolean;
}

/** Dispatch pending notifications for one org through the mailer. Honours opt-out
 *  preferences. With no mailer, leaves everything pending (graceful degradation). */
export async function dispatchPending(orgId: string, admin: SupabaseClient, mailer: Mailer | null): Promise<DispatchSummary> {
  const { data: pending, error } = await admin
    .from("notifications")
    .select("id, kind, recipient_email, subject, body")
    .eq("org_id", orgId)
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(500);
  if (error) throw new Error(`dispatch read failed: ${error.message}`);
  const rows = (pending ?? []) as { id: number; kind: string; recipient_email: string; subject: string; body: string }[];

  const summary: DispatchSummary = { sent: 0, skipped: 0, errors: 0, pending: rows.length, mailerConfigured: !!mailer };
  if (!mailer || rows.length === 0) return summary;

  // Load opt-outs once (email|kind) for this org.
  const { data: prefs } = await admin.from("notification_prefs").select("email, kind, opted_out").eq("org_id", orgId).eq("opted_out", true);
  const optedOut = new Set((prefs ?? []).map((p) => `${(p as { email: string }).email}|${(p as { kind: string }).kind}`));

  for (const n of rows) {
    if (optedOut.has(`${n.recipient_email}|${n.kind}`)) {
      await admin.from("notifications").update({ status: "skipped", error: "opt-out" }).eq("id", n.id);
      summary.skipped++;
      continue;
    }
    try {
      await mailer.send({ to: n.recipient_email, subject: n.subject, body: n.body });
      await admin.from("notifications").update({ status: "sent", sent_at: new Date().toISOString(), error: null }).eq("id", n.id);
      summary.sent++;
    } catch (err) {
      await admin.from("notifications").update({ status: "error", error: err instanceof Error ? err.message : "send failed" }).eq("id", n.id);
      summary.errors++;
    }
  }
  summary.pending = rows.length - summary.sent - summary.skipped - summary.errors;
  return summary;
}

/** Full cron pass for one org: gather → enqueue → dispatch. Clients/clock are
 *  injectable so the whole pipeline is provable end-to-end in tests. */
export async function runNotifications(
  orgId: string,
  deps: { admin?: SupabaseClient; mailer?: Mailer | null; today?: Date } = {}
): Promise<{ enqueued: number } & DispatchSummary> {
  const admin = deps.admin ?? adminClient();
  const mailer = deps.mailer !== undefined ? deps.mailer : getMailer();
  const today = deps.today ?? new Date();

  const inputs = await gatherInputs(orgId, admin, today);
  const due = buildDueNotifications(inputs, today);
  const enqueued = await enqueueNotifications(orgId, due, admin);
  const dispatch = await dispatchPending(orgId, admin, mailer);
  return { enqueued, ...dispatch };
}

export interface NotificationRow {
  id: number;
  kind: string;
  recipientEmail: string;
  subject: string;
  status: string;
  error: string | null;
  sentAt: string | null;
  createdAt: string;
}

/** Recent notifications for the journal screen (staff read via RLS). */
export async function recentNotifications(orgId: string, opts: { status?: string; limit?: number } = {}): Promise<NotificationRow[]> {
  const supabase = createClient();
  let q = supabase
    .from("notifications")
    .select("id, kind, recipient_email, subject, status, error, sent_at, created_at")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false })
    .limit(opts.limit ?? 100);
  if (opts.status) q = q.eq("status", opts.status);
  const { data, error } = await q;
  if (error) throw new Error(`Failed to load notifications: ${error.message}`);
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: r.id as number,
    kind: r.kind as string,
    recipientEmail: r.recipient_email as string,
    subject: r.subject as string,
    status: r.status as string,
    error: (r.error as string) ?? null,
    sentAt: (r.sent_at as string) ?? null,
    createdAt: r.created_at as string,
  }));
}

export interface NotificationsSummary {
  sent: number;
  pending: number;
  errors: number;
}

export interface OptOut {
  id: string;
  email: string;
  kind: string;
}

/** Opt-out register for the current org (staff read via RLS). */
export async function listOptOuts(orgId: string): Promise<OptOut[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("notification_prefs")
    .select("id, email, kind")
    .eq("org_id", orgId)
    .eq("opted_out", true)
    .order("email", { ascending: true });
  if (error) throw new Error(`Failed to load preferences: ${error.message}`);
  return (data ?? []) as OptOut[];
}

/** Register an opt-out (staff-managed via RLS). Idempotent on (org, email, kind). */
export async function addOptOut(orgId: string, email: string, kind: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("notification_prefs")
    .upsert({ org_id: orgId, email: email.toLowerCase(), kind, opted_out: true, updated_at: new Date().toISOString() }, { onConflict: "org_id,email,kind" });
  if (error) throw new Error(`Failed to save preference: ${error.message}`);
}

/** Remove an opt-out row (staff-managed via RLS; org-scoped). */
export async function removeOptOut(orgId: string, id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("notification_prefs").delete().eq("org_id", orgId).eq("id", id);
  if (error) throw new Error(`Failed to remove preference: ${error.message}`);
}

/** Headline counts for the journal screen (staff read via RLS). */
export async function notificationsSummary(orgId: string): Promise<NotificationsSummary> {
  const supabase = createClient();
  const base = () => supabase.from("notifications").select("id", { count: "exact", head: true }).eq("org_id", orgId);
  const [sent, pending, errors] = await Promise.all([
    base().eq("status", "sent"),
    base().eq("status", "pending"),
    base().eq("status", "error"),
  ]);
  return { sent: sent.count ?? 0, pending: pending.count ?? 0, errors: errors.count ?? 0 };
}
