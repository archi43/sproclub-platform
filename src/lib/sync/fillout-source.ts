// NB: pas de "server-only" ici — importé par les tests Node. Ne jamais importer depuis un composant client.

/**
 * Fillout source (INC-14). Reads evaluation-form submissions via the Fillout
 * API and normalizes them for `coaching_reports` (source = 'fillout').
 *
 * Env: FILLOUT_API_KEY, FILLOUT_FORM_IDS (comma-separated form ids to ingest).
 * Absent/empty env → returns [] so the daily sync degrades gracefully.
 *
 * Normalization heuristics (form-agnostic on purpose):
 *   - dossier         = first RecordPicker « Etudiant(s) » → recordID Airtable
 *                       de la Commande (les formulaires SproCLUB sont adossés à
 *                       Airtable : c'est l'identifiant exact du dossier) ;
 *   - learner e-mail  = first answer of type EmailInput / matching an e-mail;
 *   - session date    = first DatePicker whose label mentions « date » ;
 *   - grade           = first numeric answer whose label mentions note/score,
 *                       else the average of StarRating answers (grilles jury) ;
 *   - body            = "label : value" lines for every non-empty answer.
 */
export interface FilloutSubmission {
  submissionId: string;
  submittedAt: string; // ISO
  email?: string;
  /** recordID Airtable « Commandes Formation » = enrollments_ro.airtable_record_id. */
  enrollmentRecordId?: string;
  sessionDate?: string; // YYYY-MM-DD
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
  if (typeof v === "object") {
    // RecordPicker ({Name|Clé, recordID}) et FileUpload ({url}) : garder le lisible.
    const o = v as Record<string, unknown>;
    return scalar(o.Name ?? o.name ?? o["Clé"] ?? o.url);
  }
  return undefined;
}

export function normalizeSubmission(raw: RawSubmission): FilloutSubmission {
  const questions = raw.questions ?? [];
  let email: string | undefined;
  let enrollmentRecordId: string | undefined;
  let sessionDate: string | undefined;
  let grade: number | undefined;
  const starRatings: number[] = [];
  const lines: string[] = [];

  for (const q of questions) {
    const label = (q.name ?? "").trim();
    if (!enrollmentRecordId && q.type === "RecordPicker" && /^[ée]tudiant/i.test(label) && Array.isArray(q.value)) {
      const rec = (q.value[0] as { recordID?: unknown } | undefined)?.recordID;
      if (typeof rec === "string" && rec) enrollmentRecordId = rec;
    }
    const value = scalar(q.value);
    if (!value) continue;
    if (!email && (q.type === "EmailInput" || EMAIL_RE.test(value))) {
      email = value.toLowerCase();
    }
    if (!sessionDate && q.type === "DatePicker" && /date/i.test(label) && /^\d{4}-\d{2}-\d{2}/.test(value)) {
      sessionDate = value.slice(0, 10);
    }
    if (grade === undefined && /note|score/i.test(label)) {
      const n = Number(value);
      if (!Number.isNaN(n)) grade = n;
    }
    if (q.type === "StarRating") {
      const n = Number(value);
      if (!Number.isNaN(n)) starRatings.push(n);
    }
    lines.push(label ? `${label} : ${value}` : value);
  }

  // Grilles jury : sans champ « note », la moyenne des étoiles fait office de note.
  if (grade === undefined && starRatings.length > 0) {
    grade = Math.round((starRatings.reduce((a, b) => a + b, 0) / starRatings.length) * 100) / 100;
  }

  return {
    submissionId: raw.submissionId,
    submittedAt: raw.submissionTime,
    email,
    enrollmentRecordId,
    sessionDate,
    grade,
    body: lines.join("\n"),
  };
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
