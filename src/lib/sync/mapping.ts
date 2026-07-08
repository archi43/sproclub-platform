/**
 * Airtable "Commandes Formation" → Postgres mapping (INC-1 + INC-2).
 * Ported from ../sync_cible; targets the pilot read-models (learners_ro,
 * enrollments_ro) including the 360 learner-sheet fields added in 0010.
 * Some source field names carry accents or a trailing space in the live base.
 */
export const SRC = {
  etudiant: "Etudiant", // link → Etudiant record id (stable learner key)
  prenom: "Prénom",
  nom: "Nom",
  email: "Email étudiant",
  tel: "N° téléphone (from Etudiant)",
  ville: "Ville étudiant",
  typeStagiaire: "Type de stagiaire",
  programme: "Produit - nom long",
  financeur: "Type de financement",
  statut: "Statut",
  dateDebContract: "Date contractuelle de début de formation",
  dateDebReelle: "Date réelle de début de formation",
  dateFinAcces: "Date de fin des accès",
  site: "Site de réalisation",
  coachEmail: "Email coach référent",
  avancement: "Avancement réél",
  retard: "NBRE DE JOURS DE RETARD REEL",
  projetsValides: "Nombre de projets validés",
  projetsOblig: "Nombre de projets obligatoires à valider",
  note: "Note globale ( sur 4)",
  certif: "Certification SAP obtenue ",
  dateExam: "Date examen certification",
  resultatJury: "Résultat jury final",
  situation: "[Insertion pro] Situation professionnelle aujourd'hui",
  poste: "[Insertion pro] Intitulé du poste",
  contrat: "[Insertion pro] Type de contrat",
  entreprise: "[Insertion pro] Nom de l'entreprise",
  score: "AVERAGE de Score (à partir de Questionnaires de satisfaction)",
  nps: "NPS AVERAGE (à partir de Questionnaires de satisfaction)",
  attEntree: "Confirmation envoi attestation d'entrée en formation",
  attFin: "Confirmation envoi attestation de fin de formation",
  convention: "Convention ", // NB: trailing space in the live base
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
function asNumber(v: unknown): number | undefined {
  const s = scalar(v);
  if (typeof s === "number") return s;
  if (typeof s === "string" && s.trim() !== "" && !Number.isNaN(Number(s))) return Number(s);
  return undefined;
}
function asBool(v: unknown): boolean | undefined {
  const s = scalar(v);
  if (typeof s === "boolean") return s;
  if (typeof s === "number") return s !== 0;
  if (typeof s === "string") return /^(true|oui|1|fait|envoy)/i.test(s.trim());
  return undefined;
}
/** Keep only the YYYY-MM-DD part; undefined if not a parseable date. */
function asDate(v: unknown): string | undefined {
  const s = asString(v);
  const m = s?.match(/^\d{4}-\d{2}-\d{2}/);
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
const normalizeCertif = (v: unknown): string | undefined => {
  const s = scalar(v);
  if (typeof s === "boolean") return s ? "Oui" : "Non";
  return keyword(asSelect(v), [
    [/(obten|oui|r[ée]ussi|admis)/i, "Oui"], [/(non|[ée]chou|ajourn)/i, "Non"],
    [/(attente|pr[ée]vu|planifi)/i, "En attente"],
  ]);
};
const normalizeJury = (v: unknown): string | undefined =>
  keyword(asSelect(v), [[/admis|r[ée]ussi/i, "Admis"], [/ajourn|[ée]chou/i, "Ajourné"], [/attente/i, "En attente"]]);
const normalizeSituation = (v: unknown): string | undefined =>
  keyword(asSelect(v), [[/poste|emploi|cdi|cdd/i, "En poste"], [/recherche/i, "En recherche"], [/formation/i, "En formation"]], "Autre");
const normalizeContrat = (v: unknown): string | undefined =>
  keyword(asSelect(v), [[/cdi/i, "CDI"], [/cdd/i, "CDD"], [/int[ée]rim/i, "Intérim"], [/freelance|ind[ée]pendant/i, "Freelance"], [/altern/i, "Alternance"]], "Autre");
const normalizeSite = (v: unknown): string | undefined =>
  keyword(asSelect(v), [[/distanc/i, "Distanciel"], [/pr[ée]sent/i, "Présentiel"], [/hybrid/i, "Hybride"]]);
const normalizeTypeStagiaire = (v: unknown): string | undefined =>
  keyword(asSelect(v), [[/reconvers/i, "Reconversion"], [/salari/i, "Salarié"], [/demandeur|emploi/i, "Demandeur d'emploi"]], "Autre");

// --- row builders (plain objects matching the Postgres columns) -------------
export interface LearnerRow {
  airtable_record_id: string;
  unique_learner_id: string;
  first_name?: string;
  last_name?: string;
  email: string;
  phone?: string;
  city?: string;
  trainee_type?: string;
}

export interface EnrollmentRow {
  airtable_record_id: string;
  program?: string;
  status?: string;
  financer?: string;
  start_date?: string;
  access_end_date?: string;
  coach_email?: string;
  site?: string;
  progress?: number;
  late_days?: number;
  projects_validated?: number;
  projects_required?: number;
  global_grade?: number;
  certification?: string;
  certification_exam_date?: string;
  jury_result?: string;
  insertion_situation?: string;
  insertion_role?: string;
  insertion_contract?: string;
  insertion_company?: string;
  satisfaction_score?: number;
  nps?: number;
  attestation_entry_sent?: boolean;
  attestation_end_sent?: boolean;
  convention_signed?: boolean;
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
    phone: asString(rec.fields[SRC.tel]),
    city: asString(rec.fields[SRC.ville]),
    trainee_type: normalizeTypeStagiaire(rec.fields[SRC.typeStagiaire]),
  };
}

/** Build an enrollment row keyed by the source Commande record id. */
export function buildEnrollment(rec: SourceRecord): EnrollmentRow {
  const g = (f: string) => rec.fields[f];
  return {
    airtable_record_id: rec.id,
    program: asString(g(SRC.programme)),
    status: normalizeStatut(g(SRC.statut)),
    financer: normalizeFinanceur(g(SRC.financeur)),
    start_date: asDate(g(SRC.dateDebReelle)) ?? asDate(g(SRC.dateDebContract)),
    access_end_date: asDate(g(SRC.dateFinAcces)),
    coach_email: normalizeEmail(g(SRC.coachEmail)),
    site: normalizeSite(g(SRC.site)),
    progress: asNumber(g(SRC.avancement)),
    late_days: asNumber(g(SRC.retard)),
    projects_validated: asNumber(g(SRC.projetsValides)),
    projects_required: asNumber(g(SRC.projetsOblig)),
    global_grade: asNumber(g(SRC.note)),
    certification: normalizeCertif(g(SRC.certif)),
    certification_exam_date: asDate(g(SRC.dateExam)),
    jury_result: normalizeJury(g(SRC.resultatJury)),
    insertion_situation: normalizeSituation(g(SRC.situation)),
    insertion_role: asString(g(SRC.poste)),
    insertion_contract: normalizeContrat(g(SRC.contrat)),
    insertion_company: asString(g(SRC.entreprise)),
    satisfaction_score: asNumber(g(SRC.score)),
    nps: asNumber(g(SRC.nps)),
    attestation_entry_sent: asBool(g(SRC.attEntree)),
    attestation_end_sent: asBool(g(SRC.attFin)),
    convention_signed: asBool(g(SRC.convention)),
  };
}
