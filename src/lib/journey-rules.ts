/**
 * INC-20 — écran « Mon parcours » (P.A1) : règles d'affichage, pures.
 *
 * Le cahier des charges demande de mettre en avant l'échéance proche et de
 * signaler un document manquant. On ne remonte à l'apprenant que ce sur quoi
 * il peut agir : sa convention et ses questionnaires. Les pièces internes
 * (comptes rendus du coach, note de soutenance) restent hors de sa vue —
 * l'inquiéter sur une tâche qui ne lui appartient pas serait contre-productif.
 */

export const ACCESS_ALERT_DAYS = 30;
export const ACCESS_URGENT_DAYS = 7;
export const DEADLINE_SOON_DAYS = 3;

/** Pièces dont l'apprenant est réellement l'acteur (clés de `compliancePieces`). */
export const LEARNER_ACTIONABLE_PIECES = ["convention", "satisfaction"] as const;

export type AlertTone = "info" | "warning" | "error";

export interface JourneyAlert {
  key: string;
  tone: AlertTone;
  message: string;
}

export interface UpcomingEvent {
  kind: "coaching" | "defense";
  startsAt: string;
  /** `pending` = créneau réservé mais pas encore confirmé. */
  status: string | null;
}

export interface JourneyInput {
  status: string | null;
  accessEndDate: string | null;
  endDate: string | null;
  next: UpcomingEvent | null;
  /** Libellés des pièces manquantes dont l'apprenant est l'acteur. */
  missingPieces: string[];
  now?: Date;
}

const DAY_MS = 86_400_000;

/** Jours entiers restants jusqu'à une date (négatif si dépassée). */
export function daysUntil(date: string | null, now: Date = new Date()): number | null {
  if (!date) return null;
  const target = Date.parse(date.length === 10 ? `${date}T23:59:59Z` : date);
  if (!Number.isFinite(target)) return null;
  return Math.ceil((target - now.getTime()) / DAY_MS);
}

const eventLabel = (kind: UpcomingEvent["kind"]) => (kind === "defense" ? "soutenance" : "séance de coaching");

/**
 * Alertes du parcours, de la plus urgente à la moins urgente. Un dossier
 * terminé n'alerte plus sur ses échéances : elles sont derrière lui.
 */
export function buildJourneyAlerts(input: JourneyInput): JourneyAlert[] {
  const now = input.now ?? new Date();
  const alerts: JourneyAlert[] = [];
  const finished = input.status === "Terminé";

  // 1) Accès serveur qui expire — la contrainte la plus dure du parcours.
  const accessDays = daysUntil(input.accessEndDate, now);
  if (!finished && accessDays != null && accessDays >= 0) {
    if (accessDays <= ACCESS_URGENT_DAYS) {
      alerts.push({
        key: "access-urgent",
        tone: "error",
        message:
          accessDays === 0
            ? "Votre accès aux serveurs se termine aujourd'hui."
            : `Votre accès aux serveurs se termine dans ${accessDays} jour(s).`,
      });
    } else if (accessDays <= ACCESS_ALERT_DAYS) {
      alerts.push({
        key: "access-soon",
        tone: "warning",
        message: `Votre accès aux serveurs se termine dans ${accessDays} jours.`,
      });
    }
  }

  // 2) Rendez-vous réservé mais pas encore confirmé.
  if (input.next && input.next.status === "pending") {
    alerts.push({
      key: "booking-pending",
      tone: "warning",
      message: `Votre ${eventLabel(input.next.kind)} est réservée mais reste à confirmer.`,
    });
  }

  // 3) Échéance proche mise en avant (CDC).
  const nextDays = daysUntil(input.next?.startsAt ?? null, now);
  if (input.next && nextDays != null && nextDays >= 0 && nextDays <= DEADLINE_SOON_DAYS) {
    alerts.push({
      key: "deadline-soon",
      tone: "info",
      message:
        nextDays === 0
          ? `Votre ${eventLabel(input.next.kind)} a lieu aujourd'hui.`
          : `Votre ${eventLabel(input.next.kind)} a lieu dans ${nextDays} jour(s).`,
    });
  }

  // 4) Documents que l'apprenant doit fournir.
  if (input.missingPieces.length > 0) {
    alerts.push({
      key: "missing-pieces",
      tone: "warning",
      message: `À fournir : ${input.missingPieces.join(", ")}.`,
    });
  }

  return alerts;
}

/** Pourcentage d'avancement borné, ou null si l'information manque. */
export function progressPercent(progress: number | null): number | null {
  if (progress == null || !Number.isFinite(progress)) return null;
  // La source exprime tantôt 0–1, tantôt 0–100.
  const value = progress <= 1 ? progress * 100 : progress;
  return Math.max(0, Math.min(100, Math.round(value)));
}
