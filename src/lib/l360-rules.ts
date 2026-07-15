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
 * Choisit le cours de rendu d'un parcours projet : le dernier pas de type
 * `course` (progression linéaire — le rendu clôt le parcours). Null si le
 * parcours n'a aucun cours (ex. parcours d'assessment pur) : la sync retombe
 * alors sur le seul signal de validation.
 */
export function pickDepositCourseId(steps: readonly L360PathStep[]): string | null {
  for (let i = steps.length - 1; i >= 0; i--) {
    if (steps[i].type === "course") return steps[i].id;
  }
  return null;
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
