/**
 * Lecture d'un agenda iCalendar (INC-19) — port pur, sans accès réseau ni base.
 *
 * On ne cherche PAS à implémenter RFC 5545 : uniquement ce qu'il faut pour
 * savoir « quand cette personne est déjà occupée ». Les événements marqués
 * annulés ou transparents (« disponible ») sont ignorés ; les récurrences
 * (RRULE) ne sont pas développées — limite assumée et documentée à l'écran.
 */

export interface IcsEvent {
  uid: string | null;
  startsAt: string;
  endsAt: string;
}

const DAY_MS = 86_400_000;
const MINUTE_MS = 60_000;

/** Déplie les lignes continuées (RFC 5545 §3.1 : suite préfixée d'un blanc). */
function unfold(text: string): string[] {
  const raw = text.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  for (const line of raw) {
    if ((line.startsWith(" ") || line.startsWith("\t")) && out.length > 0) {
      out[out.length - 1] += line.slice(1);
    } else {
      out.push(line);
    }
  }
  return out;
}

function zoneOffsetMinutes(instant: Date, timeZone: string): number {
  try {
    const value = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "longOffset" })
      .formatToParts(instant)
      .find((p) => p.type === "timeZoneName")?.value;
    const m = /GMT([+-])(\d{2}):(\d{2})/.exec(value ?? "");
    if (!m) return 0;
    return (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3]));
  } catch {
    return 0; // TZID inconnu → traité comme UTC
  }
}

/**
 * Convertit une valeur DTSTART/DTEND en instant ISO.
 * Formats gérés : `20260908T140000Z` (UTC), `20260908T140000` + TZID (heure
 * locale du fuseau), `20260908` (journée entière).
 */
export function parseIcsDate(value: string, tzid?: string): { iso: string; allDay: boolean } | null {
  const v = value.trim();
  const dateOnly = /^(\d{4})(\d{2})(\d{2})$/.exec(v);
  if (dateOnly) {
    const [, y, m, d] = dateOnly;
    return { iso: `${y}-${m}-${d}T00:00:00.000Z`, allDay: true };
  }
  const dateTime = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/.exec(v);
  if (!dateTime) return null;
  const [, y, mo, d, h, mi, s, zulu] = dateTime;
  const naive = Date.UTC(+y, +mo - 1, +d, +h, +mi, +s);
  if (zulu) return { iso: new Date(naive).toISOString(), allDay: false };
  if (!tzid) return { iso: new Date(naive).toISOString(), allDay: false };
  const guess = new Date(naive - zoneOffsetMinutes(new Date(naive), tzid) * MINUTE_MS);
  const exact = new Date(naive - zoneOffsetMinutes(guess, tzid) * MINUTE_MS);
  return { iso: exact.toISOString(), allDay: false };
}

/** Nom de propriété et paramètres d'une ligne « DTSTART;TZID=Europe/Paris:2026… ». */
function splitLine(line: string): { name: string; params: Record<string, string>; value: string } | null {
  const colon = line.indexOf(":");
  if (colon < 0) return null;
  const head = line.slice(0, colon);
  const value = line.slice(colon + 1);
  const [name, ...paramParts] = head.split(";");
  const params: Record<string, string> = {};
  for (const p of paramParts) {
    const eq = p.indexOf("=");
    if (eq > 0) params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1);
  }
  return { name: name.toUpperCase(), params, value };
}

/**
 * Événements occupants d'un flux iCalendar, bornés à la fenêtre demandée.
 * Un événement sans DTEND dure une heure (ou la journée s'il est « all day »).
 */
export function parseIcs(text: string, opts: { from?: Date; to?: Date } = {}): IcsEvent[] {
  const events: IcsEvent[] = [];
  const from = opts.from?.toISOString();
  const to = opts.to?.toISOString();

  let inEvent = false;
  let uid: string | null = null;
  let start: { iso: string; allDay: boolean } | null = null;
  let end: { iso: string; allDay: boolean } | null = null;
  let skip = false;

  for (const line of unfold(text)) {
    const trimmed = line.trim();
    if (trimmed === "BEGIN:VEVENT") {
      inEvent = true;
      uid = null;
      start = null;
      end = null;
      skip = false;
      continue;
    }
    if (trimmed === "END:VEVENT") {
      if (inEvent && start && !skip) {
        const startIso = start.iso;
        const endIso =
          end?.iso ??
          new Date(Date.parse(startIso) + (start.allDay ? DAY_MS : 60 * MINUTE_MS)).toISOString();
        const withinWindow = (!to || startIso <= to) && (!from || endIso >= from);
        if (withinWindow && endIso > startIso) {
          events.push({ uid, startsAt: startIso, endsAt: endIso });
        }
      }
      inEvent = false;
      continue;
    }
    if (!inEvent) continue;

    const parsed = splitLine(trimmed);
    if (!parsed) continue;
    switch (parsed.name) {
      case "UID":
        uid = parsed.value || null;
        break;
      case "DTSTART":
        start = parseIcsDate(parsed.value, parsed.params.TZID);
        break;
      case "DTEND":
        end = parseIcsDate(parsed.value, parsed.params.TZID);
        break;
      case "STATUS":
        if (parsed.value.toUpperCase() === "CANCELLED") skip = true;
        break;
      case "TRANSP":
        // « TRANSPARENT » = l'événement n'occupe pas la personne.
        if (parsed.value.toUpperCase() === "TRANSPARENT") skip = true;
        break;
      default:
        break;
    }
  }

  return events;
}

/**
 * Garde SSRF : le lien d'agenda est fourni par l'utilisateur et récupéré par le
 * serveur. On refuse tout ce qui ne sort pas vers l'Internet public — sinon le
 * job devient une sonde du réseau interne.
 */
export function assertPublicHttpUrl(rawUrl: string): URL {
  let url: URL;
  try {
    url = new URL(rawUrl.replace(/^webcal:\/\//i, "https://"));
  } catch {
    throw new Error("Lien d'agenda invalide.");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("Seuls les liens http(s) sont acceptés.");
  }
  const host = url.hostname.toLowerCase();
  const isPrivate =
    host === "localhost" ||
    host === "::1" ||
    host.endsWith(".localhost") ||
    host.endsWith(".internal") ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    /^0\./.test(host) ||
    host.startsWith("[");
  if (isPrivate) {
    throw new Error("Ce lien pointe vers une adresse réseau interne.");
  }
  return url;
}
