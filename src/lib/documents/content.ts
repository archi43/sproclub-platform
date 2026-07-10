/**
 * Document content (INC-9) — PURE builders (no I/O, no pdf lib), so the mandatory
 * mentions and the mapping from dossier data are unit-tested without a database
 * or a renderer. `src/lib/documents/pdf.ts` turns a DocumentContent into a PDF.
 *
 * Covers the Qualiopi documents: attestation d'entrée / de fin, convention de
 * formation, convocation de soutenance.
 */

export type DocumentKind =
  | "attestation_entree"
  | "attestation_fin"
  | "convention"
  | "convocation_soutenance";

export const DOCUMENT_LABELS: Record<DocumentKind, string> = {
  attestation_entree: "Attestation d'entrée en formation",
  attestation_fin: "Attestation de fin de formation",
  convention: "Convention de formation",
  convocation_soutenance: "Convocation de soutenance",
};

export const DOCUMENT_KINDS = Object.keys(DOCUMENT_LABELS) as DocumentKind[];

/** The dossier data a document draws from. */
export interface DocumentData {
  organizationName: string;
  learnerName: string;
  learnerEmail: string;
  program: string | null;
  specialty: string | null;
  financer: string | null;
  startDate: string | null;
  endDate: string | null;
  /** ISO date the document is issued (passed in — pure functions take no clock). */
  issuedOn: string;
  /** For a convocation: the defense date/time, when known. */
  defenseDate?: string | null;
}

export interface DocumentContent {
  kind: DocumentKind;
  title: string;
  /** Ordered body paragraphs (mandatory mentions + dossier data). */
  body: string[];
  /** Footer legal mentions. */
  footer: string[];
}

const dash = (v: string | null | undefined) => (v && v.trim() !== "" ? v : "—");

/** Build the content (title, body, mandatory mentions) for a document kind. */
export function buildDocument(kind: DocumentKind, d: DocumentData): DocumentContent {
  const who = `${d.learnerName} (${d.learnerEmail})`;
  const prog = dash(d.program) + (d.specialty ? ` — ${d.specialty}` : "");
  const period = `du ${dash(d.startDate)} au ${dash(d.endDate)}`;

  const common: string[] = [
    `Organisme de formation : ${d.organizationName}`,
    `Apprenant : ${who}`,
    `Action de formation : ${prog}`,
  ];

  switch (kind) {
    case "attestation_entree":
      return {
        kind,
        title: DOCUMENT_LABELS[kind],
        body: [
          ...common,
          `Financement : ${dash(d.financer)}`,
          `Nous attestons que l'apprenant est entré en formation ${period}.`,
        ],
        footer: [
          `Fait le ${d.issuedOn}.`,
          "Attestation établie pour valoir ce que de droit (art. L. 6353-1 du Code du travail).",
        ],
      };
    case "attestation_fin":
      return {
        kind,
        title: DOCUMENT_LABELS[kind],
        body: [
          ...common,
          `Financement : ${dash(d.financer)}`,
          `Nous attestons que l'apprenant a suivi l'action de formation ${period}.`,
          "Assiduité et réalisation de l'action attestées par l'organisme.",
        ],
        footer: [
          `Fait le ${d.issuedOn}.`,
          "Attestation de fin de formation (art. L. 6353-1 du Code du travail).",
        ],
      };
    case "convention":
      return {
        kind,
        title: DOCUMENT_LABELS[kind],
        body: [
          ...common,
          `Financement : ${dash(d.financer)}`,
          `La présente convention règle l'action de formation ${period}.`,
          "Objet, modalités, durée et prix sont ceux du programme de formation annexé.",
        ],
        footer: [
          `Fait le ${d.issuedOn}, en deux exemplaires.`,
          "Convention de formation professionnelle (art. L. 6353-2 du Code du travail).",
        ],
      };
    case "convocation_soutenance":
      return {
        kind,
        title: DOCUMENT_LABELS[kind],
        body: [
          ...common,
          `Vous êtes convoqué(e) à votre soutenance le ${dash(d.defenseDate)}.`,
          "La présentation se déroule devant un jury de deux évaluateurs indépendants.",
        ],
        footer: [`Fait le ${d.issuedOn}.`],
      };
    default:
      throw new Error(`Type de document inconnu : ${kind as string}`);
  }
}

/** A safe file name (no path separators / spaces) for the Storage object. */
export function documentFileName(kind: DocumentKind, issuedOn: string): string {
  return `${kind}-${issuedOn}.pdf`;
}
