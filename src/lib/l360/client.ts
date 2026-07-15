// NB: pas de "server-only" ici — le PORT (interface) est importé par les tests
// Node qui injectent un client factice. Ne jamais importer depuis un composant
// client ; l'implémentation réelle n'est instanciée que par la route cron.
import type { L360PathStep } from "../l360-rules.ts";

/**
 * Port + adaptateur 360Learning (INC-15). API v2, OAuth2 client credentials.
 * Lecture seule : parcours, statistiques de parcours/cours, annuaire. La
 * plateforme n'écrit JAMAIS dans 360L (l'API ne le permet d'ailleurs pas pour
 * les livrables). Dégradation propre : sans credentials, la sync répond
 * « non configuré » sans casser l'app (même patron qu'Airtable/Cal.eu).
 *
 * Env : L360_CLIENT_ID, L360_CLIENT_SECRET (jamais au dépôt).
 */

const BASE_URL = "https://app.360learning.com/api/v2";
const API_VERSION_HEADER = { "360-api-version": "v2.0" };
const TOKEN_SAFETY_MARGIN_MS = 60_000;

export class L360NotConfiguredError extends Error {
  constructor() {
    super("360Learning n'est pas configuré (L360_CLIENT_ID / L360_CLIENT_SECRET absents).");
    this.name = "L360NotConfiguredError";
  }
}

export interface L360Path {
  id: string;
  name: string;
  steps: L360PathStep[];
}

export interface L360PathStat {
  userId: string;
  pathId: string;
  statusType: string;
  progress: number;
  score: number | null;
  enrolledAt: string | null;
  completedAt: string | null;
}

export interface L360CourseStat {
  userId: string;
  courseId: string;
  completedAt: string | null;
}

export interface L360User {
  id: string;
  email: string | null;
}

/** Port : la sync ne dépend que de cette interface (tests → client factice). */
export interface L360Client {
  listPaths(): Promise<L360Path[]>;
  listPathStats(pathId: string): Promise<L360PathStat[]>;
  listCourseStats(courseId: string): Promise<L360CourseStat[]>;
  listUsers(): Promise<L360User[]>;
}

export function isL360Configured(): boolean {
  return !!process.env.L360_CLIENT_ID && !!process.env.L360_CLIENT_SECRET;
}

interface RawRecord {
  [key: string]: unknown;
}

/** Adaptateur réel (fetch). Jette L360NotConfiguredError sans credentials. */
export function l360Client(): L360Client {
  const clientId = process.env.L360_CLIENT_ID;
  const clientSecret = process.env.L360_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new L360NotConfiguredError();

  let cachedToken: { value: string; expiresAt: number } | null = null;

  // Corps d'erreur amont tronqué : il finit dans sync_log/ops_events (minimisation).
  const errText = async (res: Response): Promise<string> => (await res.text()).slice(0, 200);

  async function getToken(): Promise<string> {
    if (cachedToken && Date.now() < cachedToken.expiresAt) return cachedToken.value;
    const res = await fetch(`${BASE_URL}/oauth2/token`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ grant_type: "client_credentials", client_id: clientId, client_secret: clientSecret }),
    });
    if (!res.ok) throw new Error(`360L token failed: ${res.status} ${await errText(res)}`);
    const data = (await res.json()) as { access_token: string; expires_in: number };
    cachedToken = { value: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 - TOKEN_SAFETY_MARGIN_MS };
    return cachedToken.value;
  }

  /** GET paginé : suit l'en-tête `Link rel="next"` jusqu'à épuisement. */
  async function fetchAll(path: string): Promise<RawRecord[]> {
    const token = await getToken();
    const out: RawRecord[] = [];
    let url: string | null = `${BASE_URL}${path}`;
    while (url) {
      const res: Response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}`, ...API_VERSION_HEADER },
      });
      if (!res.ok) throw new Error(`360L fetch ${path} failed: ${res.status} ${await errText(res)}`);
      const page = (await res.json()) as RawRecord[];
      out.push(...page);
      const link = res.headers.get("link") ?? "";
      const next = /<([^>]+)>\s*;\s*rel="next"/.exec(link);
      url = next ? next[1] : null;
    }
    return out;
  }

  const str = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
  const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

  return {
    async listPaths() {
      const raw = await fetchAll("/paths");
      return raw.map((p) => ({
        id: String(p._id),
        name: str(p.name) ?? "",
        steps: (Array.isArray(p.steps) ? p.steps : []).map((s: RawRecord) => ({
          id: String(s._id),
          type: str(s.type) ?? "",
        })),
      }));
    },

    async listPathStats(pathId: string) {
      const raw = await fetchAll(`/paths/stats?pathId%5Beq%5D=${encodeURIComponent(pathId)}`);
      return raw.map((r) => ({
        userId: String(r.userId),
        pathId: String(r.pathId),
        statusType: str((r.status as RawRecord | undefined)?.type) ?? "unknown",
        progress: num(r.progress) ?? 0,
        score: num(r.score),
        enrolledAt: str(r.enrolledAt),
        completedAt: str(r.completedAt),
      }));
    },

    async listCourseStats(courseId: string) {
      const raw = await fetchAll(`/courses/stats?courseId%5Beq%5D=${encodeURIComponent(courseId)}`);
      return raw.map((r) => ({
        userId: String(r.userId),
        courseId: String(r.courseId),
        completedAt: str(r.completedAt),
      }));
    },

    async listUsers() {
      const raw = await fetchAll("/users");
      return raw.map((u) => ({ id: String(u._id), email: str(u.mail)?.toLowerCase() ?? null }));
    },
  };
}
