/**
 * Notification rules (INC-7) — pure, tested off-DB (same pattern as
 * compliance-rules / reporting-rules / rgpd-rules / ratelimit-rules).
 *
 * Given the operational read-model (upcoming defenses, ending server accesses,
 * pending reports), produce the reminders that are DUE, each with a STABLE
 * `dedupeKey` so the dispatch cron is idempotent (one reminder per entity per
 * period, never a duplicate on re-run). No DB, no I/O, no clock other than the
 * `today` passed in.
 */

export type NotificationKind = "defense_reminder" | "server_access_ending" | "report_pending";

export interface KindMeta {
  key: NotificationKind;
  label: string;
}
export const NOTIFICATION_KINDS: KindMeta[] = [
  { key: "defense_reminder", label: "Rappel de soutenance" },
  { key: "server_access_ending", label: "Fin d'accès serveur" },
  { key: "report_pending", label: "Relance compte rendu" },
];
export const kindLabel = (k: string): string => NOTIFICATION_KINDS.find((m) => m.key === k)?.label ?? k;

/** Reminder is sent when a defense is at most this many days away. */
export const DEFENSE_REMINDER_DAYS = 3;
/** Reminder is sent when a server access ends within this many days. */
export const SERVER_REMINDER_DAYS = 7;

export interface DueNotification {
  kind: NotificationKind;
  recipientEmail: string;
  subject: string;
  body: string;
  dedupeKey: string;
}

export interface DefenseInput {
  reservationId: string;
  learnerEmail: string;
  learnerName: string;
  program: string | null;
  startsAt: string; // ISO
}
export interface ServerInput {
  enrollmentId: string;
  learnerEmail: string;
  learnerName: string;
  accessEndDate: string; // YYYY-MM-DD
  daysLeft: number;
}
export interface ReportInput {
  enrollmentId: string;
  coachEmail: string | null;
  learnerName: string;
  pendingReports: number;
}

export interface NotificationInputs {
  defenses: DefenseInput[];
  servers: ServerInput[];
  reports: ReportInput[];
}

const DAY = 86_400_000;
const dateFmt = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Paris" });
const dateTimeFmt = new Intl.DateTimeFormat("fr-FR", {
  weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris",
});
const monthBucket = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;

/** Days from `today` (00:00 basis) until an ISO instant, floored. */
function daysUntil(iso: string, today: Date): number {
  return Math.floor((Date.parse(iso) - today.getTime()) / DAY);
}

/**
 * Build the reminders due as of `today`. Recipients with an empty address are
 * dropped (nothing to send). Each notification carries a stable dedupe key.
 */
export function buildDueNotifications(input: NotificationInputs, today: Date): DueNotification[] {
  const out: DueNotification[] = [];

  for (const d of input.defenses) {
    if (!d.learnerEmail) continue;
    const days = daysUntil(d.startsAt, today);
    if (days < 0 || days > DEFENSE_REMINDER_DAYS) continue;
    const when = dateTimeFmt.format(new Date(d.startsAt));
    out.push({
      kind: "defense_reminder",
      recipientEmail: d.learnerEmail,
      subject: "Rappel : votre soutenance approche",
      body: `Bonjour ${d.learnerName},\n\nVotre soutenance${d.program ? ` (${d.program})` : ""} est prévue ${when}. Pensez à préparer votre présentation et vos livrables.\n\nL'équipe SproCLUB.`,
      // Include the date: a rescheduled defense that re-enters the window gets a
      // fresh reminder instead of being silently suppressed by the old row.
      dedupeKey: `defense_reminder:${d.reservationId}:${d.startsAt.slice(0, 10)}`,
    });
  }

  for (const s of input.servers) {
    if (!s.learnerEmail) continue;
    if (s.daysLeft < 0 || s.daysLeft > SERVER_REMINDER_DAYS) continue;
    const when = dateFmt.format(new Date(`${s.accessEndDate}T00:00:00Z`));
    out.push({
      kind: "server_access_ending",
      recipientEmail: s.learnerEmail,
      subject: "Votre accès au serveur se termine bientôt",
      body: `Bonjour ${s.learnerName},\n\nVotre accès au serveur prend fin le ${when} (dans ${s.daysLeft} jour(s)). Sauvegardez vos travaux avant cette date.\n\nL'équipe SproCLUB.`,
      dedupeKey: `server_access_ending:${s.enrollmentId}:${s.accessEndDate}`,
    });
  }

  const bucket = monthBucket(today);
  for (const r of input.reports) {
    if (!r.coachEmail || r.pendingReports <= 0) continue;
    out.push({
      kind: "report_pending",
      recipientEmail: r.coachEmail,
      subject: "Comptes rendus à saisir",
      body: `Bonjour,\n\n${r.pendingReports} compte(s) rendu(s) restent à saisir pour ${r.learnerName}. Merci de les compléter dès que possible.\n\nL'équipe SproCLUB.`,
      dedupeKey: `report_pending:${r.enrollmentId}:${bucket}`,
    });
  }

  return out;
}
