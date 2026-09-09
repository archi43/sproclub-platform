/**
 * Notation par le jury — règles **pures** (INC-28), sans base ni horloge injectée.
 *
 * Enjeu d'auditabilité : une note fonde une décision de certification. Elle doit
 * pouvoir être rejouée à l'identique pour justifier une contestation, donc le
 * barème et l'état d'une soutenance se calculent ici, hors de tout contexte.
 */

/** Barème SproCLUB, aligné sur « Note globale ( sur 4 ) » côté Airtable. */
export const GRADE_MIN = 0;
export const GRADE_MAX = 4;
/** Pas de saisie : le demi-point, comme sur les grilles papier. */
export const GRADE_STEP = 0.5;

export const COMMENT_MIN_LENGTH = 10;
export const COMMENT_MAX_LENGTH = 4000;

export type EvaluationState = "à venir" | "à noter" | "notée" | "annulée";

export interface DefenseForEvaluation {
  startsAt: string;
  status: string;
  /** L'évaluateur courant a-t-il déjà déposé son appréciation ? */
  hasOwnReport: boolean;
}

/**
 * Note valide, ou `null`. Rejette tout ce qui n'est pas un multiple du pas dans
 * le barème : une note « 3,7 » n'existe pas sur une grille au demi-point, et
 * l'accepter rendrait les moyennes incomparables d'un jury à l'autre.
 */
export function parseGrade(raw: string | number | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  let value: number;
  if (typeof raw === "number") {
    value = raw;
  } else {
    // `Number("  ")` vaut 0 : sans ce filtrage, une saisie vide deviendrait un
    // zéro, ce qui condamnerait un apprenant au lieu de signaler l'oubli.
    const cleaned = raw.trim().replace(",", ".");
    if (cleaned === "") return null;
    value = Number(cleaned);
  }
  if (!Number.isFinite(value)) return null;
  if (value < GRADE_MIN || value > GRADE_MAX) return null;
  // Comparaison en centièmes : évite les surprises de virgule flottante.
  const steps = Math.round((value / GRADE_STEP) * 100) / 100;
  if (!Number.isInteger(steps)) return null;
  return value;
}

/** Toutes les notes que le formulaire propose, du barème au pas retenu. */
export function gradeScale(): number[] {
  const out: number[] = [];
  for (let v = GRADE_MIN; v <= GRADE_MAX + 1e-9; v += GRADE_STEP) {
    out.push(Math.round(v * 100) / 100);
  }
  return out;
}

/**
 * État d'une soutenance du point de vue de l'évaluateur.
 *
 * Une soutenance ne se note pas **avant** d'avoir eu lieu : la note porte sur
 * une prestation observée. C'est aussi ce qui protège d'une saisie faite « pour
 * ne pas oublier », qui viderait l'évaluation de son sens.
 */
export function evaluationState(defense: DefenseForEvaluation, now: Date): EvaluationState {
  if (defense.status === "cancelled" || defense.status === "declined") return "annulée";
  if (defense.hasOwnReport) return "notée";
  return Date.parse(defense.startsAt) > now.getTime() ? "à venir" : "à noter";
}

export function canEvaluate(defense: DefenseForEvaluation, now: Date): boolean {
  const state = evaluationState(defense, now);
  return state === "à noter" || state === "notée";
}

export interface EvaluationInput {
  grade: string | number | null | undefined;
  comment: string;
}

export interface EvaluationRejection {
  field: "grade" | "comment";
  message: string;
}

/**
 * Valide une saisie. La note est **obligatoire** : un compte rendu de jury sans
 * note ne permet pas de fonder une décision, et laisser passer un vide
 * produirait des dossiers incomplets qu'aucun écran ne signale.
 */
export function validateEvaluation(input: EvaluationInput): EvaluationRejection | null {
  const grade = parseGrade(input.grade);
  if (grade === null) {
    return { field: "grade", message: `Indiquez une note entre ${GRADE_MIN} et ${GRADE_MAX}, par pas de ${GRADE_STEP}.` };
  }
  const comment = input.comment.trim();
  if (comment.length < COMMENT_MIN_LENGTH) {
    return { field: "comment", message: `Motivez votre note en ${COMMENT_MIN_LENGTH} caractères au moins.` };
  }
  if (comment.length > COMMENT_MAX_LENGTH) {
    return { field: "comment", message: `Appréciation trop longue (${COMMENT_MAX_LENGTH} caractères au maximum).` };
  }
  return null;
}
