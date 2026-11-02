// NB: règles pures (aucune I/O) — testées hors DB, importées par la sync 360L.

/**
 * Pont 360Learning (INC-15) — règles métier pures.
 *
 * Modèle observé sur l'instance réelle (vérifié en juillet 2026) :
 *   - un « projet » du programme = un parcours 360L nommé « Projet n°X : … » ;
 *   - le DERNIER cours du parcours est le cours de rendu : la tentative de
 *     l'apprenant est clôturée (`completedAt`) dès le dépôt, même si la
 *     progression reste < 100 en attente de correction ;
 *   - la validation par le JURY clôt le parcours : statut `successful`,
 *     progression 100, `completedAt` + `score` posés.
 * D'où deux signaux distincts : dépôt (débloque la soutenance côté plateforme)
 * et validation (clôt le projet).
 */

export interface L360PathStep {
  id: string;
  type: string; // 'course' | 'assessment' | 'classroom' | 'email' | 'path' | ...
}

export interface L360PathStatRecord {
  userId: string;
  pathId: string;
  statusType: string; // 'successful' | 'onTime' | 'late' | 'notYetStarted' | 'unsuccessful' | ...
  progress: number; // 0-100
  score: number | null;
  enrolledAt: string | null;
  completedAt: string | null;
}

export interface DeliverableState {
  submitted: boolean;
  submittedAt: string | null;
  validatedAt: string | null;
  score: number | null;
}

/**
 * Extrait le numéro de projet d'un nom de parcours 360L.
 * Reconnaît « Projet n°5 : … », « Projet 3 - … », « Projet n° 2 … ».
 * Ne matche PAS les regroupements (« Projets 6, 7 & 8 ») ni les libellés sans
 * numéro immédiat (« Projet à compléter : … ») — ils ne sont pas des projets
 * synchronisables.
 */
export function extractProjectNumber(pathName: string): number | null {
  const match = /\bprojet(?!s)\s*(?:n\s*°?\s*)?(\d+)\b/i.exec(pathName);
  if (!match) return null;
  const parsed = Number.parseInt(match[1], 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

/**
 * Choisit le cours de rendu d'un parcours projet.
 *
 * Constaté en réel le 2026-11-02 : le DERNIER cours d'un parcours n'est pas le
 * rendu. 33 parcours sur 35 se terminent par « Votre avis nous intéresse », un
 * questionnaire de satisfaction PARTAGÉ par tous les projets. Le prendre pour le
 * rendu marquait « déposés » tous les projets d'un apprenant dès qu'il avait
 * répondu une seule fois (2 047 livrables sur 2 058 portaient la même date).
 *
 * Deux critères, dans l'ordre :
 *   1. le dernier cours nommé « Projet … » : la convention de SproCLUB pour le
 *      cours où l'apprenant rend son travail ;
 *   2. à défaut, le dernier cours qui n'est pas partagé entre des projets de
 *      NUMÉROS différents. Un cours de rendu peut être partagé entre variantes
 *      d'un même projet, ou entre deux programmes qui numérotent le même projet
 *      différemment (« Analyser un besoin » est le n°8 ici, le n°5 là) : c'est
 *      pourquoi le nom prime, et le partage ne sert que de repli.
 * Null si aucun cours ne convient : la sync retombe sur le seul signal de
 * validation, plutôt que de lire un mauvais cours.
 */
const DEPOSIT_COURSE_NAME = /^\s*projet\b/i;

export function pickDepositCourseId(
  steps: readonly L360PathStep[],
  context: {
    courseNames?: ReadonlyMap<string, string>;
    crossProjectCourseIds?: ReadonlySet<string>;
  } = {}
): string | null {
  const courseIds = steps.filter((s) => s.type === "course").map((s) => s.id);
  const names = context.courseNames;
  if (names) {
    const named = courseIds.filter((id) => DEPOSIT_COURSE_NAME.test(names.get(id) ?? ""));
    if (named.length > 0) return named[named.length - 1];
  }
  const cross = context.crossProjectCourseIds ?? new Set<string>();
  const own = courseIds.filter((id) => !cross.has(id));
  return own.length > 0 ? own[own.length - 1] : null;
}

/**
 * Cours présents dans des parcours projet de numéros différents : ce sont des
 * cours transverses (satisfaction, ressources communes), jamais un rendu sûr.
 */
export function crossProjectCourseIds(
  paths: ReadonlyArray<{ name: string; steps: readonly L360PathStep[] }>
): Set<string> {
  const numbersByCourse = new Map<string, Set<number>>();
  for (const path of paths) {
    const projectNumber = extractProjectNumber(path.name);
    if (!projectNumber) continue;
    for (const step of path.steps) {
      if (step.type !== "course") continue;
      const numbers = numbersByCourse.get(step.id) ?? new Set<number>();
      numbers.add(projectNumber);
      numbersByCourse.set(step.id, numbers);
    }
  }
  return new Set([...numbersByCourse].filter(([, n]) => n.size >= 2).map(([id]) => id));
}

/**
 * Faut-il corriger le cours de rendu d'une correspondance existante ?
 *   - elle n'en a pas et la règle en trouve un : oui ;
 *   - elle pointe un cours transverse (l'erreur de la règle d'origine) : oui,
 *     vers le cours calculé, ou vers « aucun » si le parcours n'est plus listé
 *     (mieux vaut le seul signal de validation qu'un faux signal de dépôt) ;
 *   - elle pointe un cours propre au projet : non, ce peut être une correction
 *     manuelle, qui reste autoritaire.
 */
export function shouldRepairDepositCourse(
  current: string | null,
  computed: string | null,
  crossProject: ReadonlySet<string>
): boolean {
  if (current === computed) return false;
  if (current === null) return computed !== null;
  return crossProject.has(current);
}

/**
 * Une tentative ne compte comme dépôt que si elle a été faite dans CE parcours.
 * Les statistiques 360L sont tenues par cours ; un cours partagé entre variantes
 * porterait sinon le dépôt d'un parcours vers les autres. Une tentative sans
 * parcours (cours suivi hors parcours) n'est pas retenue.
 */
export function attemptBelongsToPath(attemptPathId: string | null, pathId: string): boolean {
  return attemptPathId === pathId;
}

/**
 * Garde, par apprenant, l'inscription 360L la plus récente (un apprenant peut
 * apparaître dans plusieurs sessions du même parcours ; la dernière fait foi).
 */
export function latestStatPerUser(stats: readonly L360PathStatRecord[]): L360PathStatRecord[] {
  const byUser = new Map<string, L360PathStatRecord>();
  for (const stat of stats) {
    const current = byUser.get(stat.userId);
    if (!current || (stat.enrolledAt ?? "") >= (current.enrolledAt ?? "")) {
      byUser.set(stat.userId, stat);
    }
  }
  return [...byUser.values()];
}

/**
 * Décide l'état du livrable à refléter côté plateforme.
 *   - validé (jury)  : parcours `successful` → submitted + validatedAt + score ;
 *   - déposé         : tentative clôturée sur le cours de rendu → submitted ;
 *   - sinon          : rien (on n'écrit jamais un « non-dépôt » — pas de downgrade).
 */
export function decideDeliverableState(input: {
  statusType: string;
  pathCompletedAt: string | null;
  score: number | null;
  depositCompletedAt: string | null;
}): DeliverableState {
  if (input.statusType === "successful") {
    return {
      submitted: true,
      submittedAt: input.depositCompletedAt ?? input.pathCompletedAt,
      validatedAt: input.pathCompletedAt,
      score: input.score,
    };
  }
  if (input.depositCompletedAt) {
    return { submitted: true, submittedAt: input.depositCompletedAt, validatedAt: null, score: null };
  }
  return { submitted: false, submittedAt: null, validatedAt: null, score: null };
}

/**
 * Dépôts déjà enregistrés (non validés) que les signaux du jour ne confirment
 * plus. La sync n'écrit jamais de recul : ces lignes restent « déposées » tant
 * qu'une réparation explicite ne les traite pas. On les COMPTE à chaque passage
 * pour que l'écart soit visible, notamment ceux hérités de l'ancienne règle du
 * cours de rendu (questionnaire partagé).
 */
export function unconfirmedDepositKeys(
  existing: ReadonlyArray<{ enrollment_id: string; project_number: number; validated_at: string | null }>,
  confirmedKeys: ReadonlySet<string>
): string[] {
  return existing
    .filter((r) => !r.validated_at)
    .map((r) => `${r.enrollment_id}:${r.project_number}`)
    .filter((key) => !confirmedKeys.has(key));
}
