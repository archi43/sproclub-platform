/**
 * Airtable "Commandes Formation" → Postgres mapping (INC-1).
 * Ported from ../sync_cible; restricted to the columns the pilot read-models
 * carry (learners_ro, enrollments_ro). Richer dossier fields (progress, notes,
 * insertion…) belong to later tables and are out of scope here.
 *
 * Some source field names carry accents or a trailing space in the live base.
 */
export const SRC = {
  etudiant: "Etudiant", // link → Etudiant record id (stable learner key)
  prenom: "Prénom",
  nom: "Nom",
  email: "Email étudiant",
  programme: "Produit - nom long",
  financeur: "Type de financement",
  statut: "Statut",
  dateDebContract: "Date contractuelle de début de formation",
  dateDebReelle: "Date réelle de début de formation",
  dateFinAcces: "Date de fin des accès",
  coachEmail: "Email coach référent",
} as const;

/** A source record as returned by the Airtable REST API. */
export interface SourceRecord {
  id: string;
  fields: Record<string, unknown>;
}

// --- value coercion ---------------------------------------------------------
const scalar = (v: unknown): unknown => (Array.isArray(v) ? v[0] : v);
const isRecId = (v: unknown): boolean => typeof v === "string" && /^rec[A-Za-z0-9]{14}$/.test(v);

export function asString(v: unknown): string | undefined {
  const s = scalar(v);
  if (typeof s === "string") return isRecId(s) ? undefined : s.trim() || undefined;
  return undefined;
}
function asSelect(v: unknown): string | undefined {
  const s = scalar(v);
  if (typeof s === "string") return isRecId(s) ? undefined : s.trim() || undefined;
  if (s && typeof s === "object" && "name" in s) return String((s as { name: unknown }).name);
  return undefined;
}
/** Keep only the YYYY-MM-DD part; return undefined if not a parseable date. */
function asDate(v: unknown): string | undefined {
  const s = asString(v);
  if (!s) return undefined;
  const m = s.match(/^\d{4}-\d{2}-\d{2}/);
  return m ? m[0] : undefined;
}
const keyword = (v: string | undefined, table: Array<[RegExp, string]>, fallback?: string): string | undefined => {
  if (!v) return undefined;
  for (const [re, out] of table) if (re.test(v)) return out;
  return fallback;
};

// --- domain normalizers -----------------------------------------------------
export const normalizeEmail = (v: unknown): string | undefined => asString(v)?.toLowerCase();

const normalizeStatut = (v: unknown): string | undefined =>
  keyword((asSelect(v) ?? "").replace(/^\s*\d+\s*[-.]\s*/, ""), [
    [/termin/i, "Terminé"], [/cours/i, "En cours"], [/pause/i, "En pause"],
    [/abandon/i, "Abandon"], [/onboard/i, "Onboarding"], [/prospect/i, "Prospect"],
  ]);

const normalizeFinanceur = (v: unknown): string | undefined =>
  keyword(asSelect(v), [
    [/cpf/i, "CPF"], [/entreprise/i, "Entreprise"],
    [/(france travail|p[oô]le)/i, "France Travail"], [/opco/i, "OPCO"],
    [/(personnel|propre|individuel)/i, "Personnel"],
  ], "Autre");

// --- row builders (plain objects matching the Postgres columns) -------------
export interface LearnerRow {
  airtable_record_id: string;
  unique_learner_id: string;
  first_name?: string;
  last_name?: string;
  email: string;
}

export interface EnrollmentRow {
  airtable_record_id: string;
  program?: string;
  status?: string;
  financer?: string;
  start_date?: string;
  access_end_date?: string;
  coach_email?: string;
}

/** Build a learner row, or null when there is no usable e-mail (skip). */
export function buildLearner(rec: SourceRecord): LearnerRow | null {
  const email = normalizeEmail(rec.fields[SRC.email]);
  if (!email) return null;
  const etudiantId = (rec.fields[SRC.etudiant] as string[] | undefined)?.[0];
  return {
    airtable_record_id: etudiantId ?? `email:${email}`,
    unique_learner_id: email,
    first_name: asString(rec.fields[SRC.prenom]),
    last_name: asString(rec.fields[SRC.nom]),
    email,
  };
}

/** Build an enrollment row keyed by the source Commande record id. */
export function buildEnrollment(rec: SourceRecord): EnrollmentRow {
  return {
    airtable_record_id: rec.id,
    program: asString(rec.fields[SRC.programme]),
    status: normalizeStatut(rec.fields[SRC.statut]),
    financer: normalizeFinanceur(rec.fields[SRC.financeur]),
    start_date: asDate(rec.fields[SRC.dateDebReelle]) ?? asDate(rec.fields[SRC.dateDebContract]),
    access_end_date: asDate(rec.fields[SRC.dateFinAcces]),
    coach_email: normalizeEmail(rec.fields[SRC.coachEmail]),
  };
}
