/**
 * INC-19 — génération des créneaux à partir des disponibilités déclarées.
 *
 * Règle PURE (aucun accès base, aucun effet de bord) : on part des plages
 * récurrentes d'un hôte, de ses exceptions ponctuelles et des occupations
 * importées de son agenda externe, et on produit la liste des créneaux
 * réservables. Testée hors DB, comme `compliance-rules` ou `talent-rules`.
 *
 * Fuseau : les plages sont saisies en heure locale (Europe/Paris par défaut) —
 * « mardi 14 h » doit rester 14 h des deux côtés du changement d'heure. La
 * conversion vers l'instant UTC tient compte de l'offset réel à la date visée.
 */

export type BookingKind = "coaching" | "defense";

export interface AvailabilityRule {
  kind: BookingKind;
  /** 0 = dimanche … 6 = samedi (aligné sur `extract(dow)` de Postgres). */
  weekday: number;
  /** Heure locale « HH:MM ». */
  startTime: string;
  endTime: string;
  slotMinutes: number;
  validFrom?: string | null;
  validTo?: string | null;
  active?: boolean;
}

export interface AvailabilityBlock {
  /** null = s'applique à tous les types de rendez-vous. */
  kind: BookingKind | null;
  effect: "open" | "closed";
  startsAt: string;
  endsAt: string;
  slotMinutes?: number;
}

export interface BusyPeriod {
  startsAt: string;
  endsAt: string;
}

export interface Slot {
  startsAt: string;
  endsAt: string;
}

/** Préfixe des créneaux issus d'une déclaration personnelle (INC-19). */
export const SELF_SLOT_PREFIX = "self:";

export interface BookableSlot {
  host_id: string;
  calcom_ref: string | null;
}

/**
 * Créneaux réellement proposables à un apprenant.
 *
 * Les créneaux du miroir Cal.com (`cal:`) viennent d'un compte hôte unique et
 * restent ouverts à tous, comme avant. Les créneaux auto-publiés (`self:`)
 * appartiennent à une personne précise : on ne propose que ceux des hôtes
 * autorisés pour cet apprenant — sinon on lui proposerait le coach de
 * quelqu'un d'autre.
 */
export function filterBookableSlots<T extends BookableSlot>(slots: T[], allowedSelfHostIds: string[]): T[] {
  const allowed = new Set(allowedSelfHostIds);
  return slots.filter(
    (s) => !s.calcom_ref?.startsWith(SELF_SLOT_PREFIX) || allowed.has(s.host_id)
  );
}

export interface GenerateInput {
  rules: AvailabilityRule[];
  blocks?: AvailabilityBlock[];
  busy?: BusyPeriod[];
  /** Fenêtre de génération, dates locales incluses « YYYY-MM-DD ». */
  from: string;
  to: string;
  kind: BookingKind;
  timeZone?: string;
  /** Instant courant : les créneaux passés sont écartés. */
  now?: Date;
}

const DEFAULT_TIME_ZONE = "Europe/Paris";
const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;

/** Offset du fuseau (en minutes) à un instant donné — gère heure d'été/hiver. */
function zoneOffsetMinutes(instant: Date, timeZone: string): number {
  const formatted = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "longOffset" })
    .formatToParts(instant)
    .find((p) => p.type === "timeZoneName")?.value;
  const match = /GMT([+-])(\d{2}):(\d{2})/.exec(formatted ?? "");
  if (!match) return 0; // GMT pile, ou format inattendu → UTC
  const sign = match[1] === "-" ? -1 : 1;
  return sign * (Number(match[2]) * 60 + Number(match[3]));
}

/**
 * Instant UTC correspondant à une date + heure locales. L'offset dépend de
 * l'instant lui-même : on part d'une estimation, puis on corrige une fois —
 * suffisant partout sauf pendant l'heure inexistante d'un passage à l'heure
 * d'été, où l'on retombe sur l'heure suivante (comportement voulu).
 */
export function localToUtc(date: string, time: string, timeZone = DEFAULT_TIME_ZONE): Date {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const naive = Date.UTC(y, m - 1, d, hh, mm, 0, 0);
  const firstGuess = new Date(naive - zoneOffsetMinutes(new Date(naive), timeZone) * MINUTE_MS);
  return new Date(naive - zoneOffsetMinutes(firstGuess, timeZone) * MINUTE_MS);
}

/** Jour de la semaine (0 = dimanche) d'une date locale « YYYY-MM-DD ». */
export function weekdayOf(date: string, timeZone = DEFAULT_TIME_ZONE): number {
  const noon = localToUtc(date, "12:00", timeZone); // midi : jamais ambigu
  const name = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" }).format(noon);
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(name);
}

/** Dates locales « YYYY-MM-DD » de `from` à `to` inclus. */
function eachDate(from: string, to: string): string[] {
  const out: string[] = [];
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return out;
  for (let t = start; t <= end; t += DAY_MS) {
    out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
}

function isWithinValidity(rule: AvailabilityRule, date: string): boolean {
  if (rule.validFrom && date < rule.validFrom) return false;
  if (rule.validTo && date > rule.validTo) return false;
  return true;
}

/** Découpe [start, end) en tranches de `minutes`; la tranche incomplète finale est ignorée. */
function slice(start: Date, end: Date, minutes: number): Slot[] {
  const out: Slot[] = [];
  const step = minutes * MINUTE_MS;
  if (step <= 0) return out;
  for (let t = start.getTime(); t + step <= end.getTime(); t += step) {
    out.push({ startsAt: new Date(t).toISOString(), endsAt: new Date(t + step).toISOString() });
  }
  return out;
}

function overlaps(a: Slot, b: { startsAt: string; endsAt: string }): boolean {
  return a.startsAt < b.endsAt && b.startsAt < a.endsAt;
}

/**
 * Créneaux réservables sur la fenêtre demandée.
 *
 * Ordre d'application : plages récurrentes + exceptions « open », puis retrait
 * de tout ce qui chevauche une exception « closed » ou une occupation d'agenda.
 * Une fermeture l'emporte donc toujours sur une ouverture — c'est le sens
 * attendu d'un congé posé par-dessus une récurrence.
 */
export function generateSlots(input: GenerateInput): Slot[] {
  const timeZone = input.timeZone ?? DEFAULT_TIME_ZONE;
  const now = input.now ?? new Date();
  const nowIso = now.toISOString();

  const candidates: Slot[] = [];

  // 1) Plages récurrentes
  const activeRules = input.rules.filter((r) => r.active !== false && r.kind === input.kind);
  for (const date of eachDate(input.from, input.to)) {
    const dow = weekdayOf(date, timeZone);
    for (const rule of activeRules) {
      if (rule.weekday !== dow || !isWithinValidity(rule, date)) continue;
      candidates.push(
        ...slice(
          localToUtc(date, rule.startTime, timeZone),
          localToUtc(date, rule.endTime, timeZone),
          rule.slotMinutes
        )
      );
    }
  }

  // 2) Ouvertures exceptionnelles
  const blocks = input.blocks ?? [];
  for (const block of blocks) {
    if (block.effect !== "open") continue;
    if (block.kind && block.kind !== input.kind) continue;
    candidates.push(
      ...slice(new Date(block.startsAt), new Date(block.endsAt), block.slotMinutes ?? 60)
    );
  }

  // 3) Retraits : fermetures déclarées + occupations de l'agenda externe
  const closings = blocks.filter((b) => b.effect === "closed" && (!b.kind || b.kind === input.kind));
  const busy = input.busy ?? [];

  const kept = candidates.filter(
    (slot) =>
      slot.startsAt >= nowIso &&
      !closings.some((c) => overlaps(slot, c)) &&
      !busy.some((b) => overlaps(slot, b))
  );

  // 4) Dédoublonnage (une récurrence et une ouverture peuvent se recouvrir)
  const seen = new Set<string>();
  return kept
    .filter((s) => {
      const key = `${s.startsAt}|${s.endsAt}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}
