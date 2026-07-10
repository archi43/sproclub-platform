// NB: pas de "server-only" ici — importé par les tests Node. Ne jamais importer depuis un composant client.

/**
 * Fillout source (INC-14). Reads evaluation-form submissions via the Fillout
 * API and normalizes them for `coaching_reports` (source = 'fillout').
 *
 * Env: FILLOUT_API_KEY, FILLOUT_FORM_IDS (comma-separated form ids to ingest).
 * Absent/empty env → returns [] so the daily sync degrades gracefully.
 *
 * Normalization heuristics (form-agnostic on purpose):
 *   - learner e-mail  = first answer of type EmailInput / matching an e-mail;
 *   - grade           = first numeric answer whose label mentions note/score;
 *   - body            = "label : value" lines for every non-empty answer.
 */
export interface FilloutSubmission {
  submissionId: string;
  submittedAt: string; // ISO
  email?: string;
  grade?: number;
  body: string;
}

interface RawQuestion {
  name?: string;
  type?: string;
  value?: unknown;
}
interface RawSubmission {
  submissionId: string;
  submissionTime: string;
  questions?: RawQuestion[];
}
interface RawPage {
  responses?: RawSubmission[];
  totalResponses?: number;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PAGE_SIZE = 150;

function scalar(v: unknown): string | undefined {
  if (v === null || v === undefined) return undefined;
  if (typeof v === "string") return v.trim() || undefined;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) return v.map((x) => scalar(x)).filter(Boolean).join(", ") || undefined;
  return undefined;
}

export function normalizeSubmission(raw: RawSubmission): FilloutSubmission {
  const questions = raw.questions ?? [];
  let email: string | undefined;
  let grade: number | undefined;
  const lines: string[] = [];

  for (const q of questions) {
    const label = (q.name ?? "").trim();
    const value = scalar(q.value);
    if (!value) continue;
    if (!email && (q.type === "EmailInput" || EMAIL_RE.test(value))) {
      email = value.toLowerCase();
    }
    if (grade === undefined && /note|score/i.test(label)) {
      const n = Number(value);
      if (!Number.isNaN(n)) grade = n;
    }
    lines.push(label ? `${label} : ${value}` : value);
  }

  return { submissionId: raw.submissionId, submittedAt: raw.submissionTime, email, grade, body: lines.join("\n") };
}

/** Fetch all submissions of the configured evaluation forms (paginated). */
export async function fetchFilloutSubmissions(): Promise<FilloutSubmission[]> {
  const apiKey = process.env.FILLOUT_API_KEY;
  const formIds = (process.env.FILLOUT_FORM_IDS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!apiKey || formIds.length === 0) return [];

  const out: FilloutSubmission[] = [];
  for (const formId of formIds) {
    let offset = 0;
    for (;;) {
      const res = await fetch(
        `https://api.fillout.com/v1/api/forms/${encodeURIComponent(formId)}/submissions?limit=${PAGE_SIZE}&offset=${offset}`,
        { headers: { Authorization: `Bearer ${apiKey}` } }
      );
      if (!res.ok) throw new Error(`Fillout fetch failed (${formId}): ${res.status} ${await res.text()}`);
      const page = (await res.json()) as RawPage;
      const batch = page.responses ?? [];
      for (const raw of batch) out.push(normalizeSubmission(raw));
      if (batch.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }
  }
  return out;
}
