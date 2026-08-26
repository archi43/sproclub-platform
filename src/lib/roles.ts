import type { AppRole } from "@/lib/types";

/** Human labels for the per-org roles (UI only; the enum stays the source of
 *  truth). Order = the order shown in role pickers. */
export const ROLE_ORDER: AppRole[] = ["direction", "coordinator", "coach", "evaluator", "student", "partner"];

export const ROLE_LABELS: Record<AppRole, string> = {
  direction: "Direction",
  coordinator: "Coordination",
  coach: "Coach",
  evaluator: "Évaluateur",
  student: "Apprenant",
  partner: "Entreprise partenaire",
};

export function roleLabel(role: AppRole): string {
  return ROLE_LABELS[role] ?? role;
}

/**
 * Écran d'accueil de chaque rôle — première page de son portail, telle que
 * définie par la navigation du route group correspondant.
 *
 * Sans cette table, l'accueil envoyait **tout le monde** vers `/mon-parcours`,
 * le portail apprenant : un coach, un membre du jury, la coordination ou une
 * entreprise partenaire tombaient sur une route interdite par leur garde de rôle.
 */
export const ROLE_HOME: Record<AppRole, string> = {
  direction: "/coordination/pilotage",
  coordinator: "/coordination/pilotage",
  coach: "/coaching",
  evaluator: "/jury",
  student: "/mon-parcours",
  partner: "/vivier",
};

/**
 * Portail d'accueil pour un compte, qui peut porter **plusieurs rôles** dans un
 * même organisme (un coach est souvent aussi évaluateur). On suit `ROLE_ORDER`,
 * du plus large au plus restreint : le rôle le plus étendu décide, sinon un
 * coach-évaluateur atterrirait sur le portail jury, plus étroit que le sien.
 *
 * Renvoie `null` si le compte n'a aucun rôle dans l'organisme : l'appelant doit
 * alors traiter le cas explicitement plutôt que de proposer un lien mort.
 */
export function homeHrefForRoles(roles: readonly AppRole[]): string | null {
  const role = ROLE_ORDER.find((r) => roles.includes(r));
  return role ? ROLE_HOME[role] : null;
}
