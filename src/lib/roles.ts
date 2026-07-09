import type { AppRole } from "@/lib/types";

/** Human labels for the per-org roles (UI only; the enum stays the source of
 *  truth). Order = the order shown in role pickers. */
export const ROLE_ORDER: AppRole[] = ["direction", "coordinator", "coach", "evaluator", "student"];

export const ROLE_LABELS: Record<AppRole, string> = {
  direction: "Direction",
  coordinator: "Coordination",
  coach: "Coach",
  evaluator: "Évaluateur",
  student: "Apprenant",
};

export function roleLabel(role: AppRole): string {
  return ROLE_LABELS[role] ?? role;
}
