"use server";

import { revalidatePath } from "next/cache";
import { getOrgContext } from "@/lib/tenant";
import { getCurrentUser, getRolesForOrg } from "@/lib/auth";
import { setStaffTalentStatus } from "@/lib/data/talent";
import type { StaffTalentStatus } from "@/lib/talent-rules";

export type TalentActionState = { ok: boolean; message: string };

const STATUSES: (StaffTalentStatus | "")[] = ["", "searching", "employed", "unavailable"];

/**
 * INC-17 : la coordination pose le statut vivier d'un apprenant. La RLS
 * (talent_profiles_staff_manage) + le trigger staff_status restent les
 * garde-fous serveur ; on re-vérifie néanmoins le rôle (server actions =
 * endpoints autonomes, même règle que l'administration).
 */
export async function setTalentStatusAction(_prev: TalentActionState, formData: FormData): Promise<TalentActionState> {
  const org = await getOrgContext();
  const user = await getCurrentUser();
  if (!org || !user) return { ok: false, message: "Session invalide." };
  const roles = await getRolesForOrg(org.id);
  if (!roles.includes("direction") && !roles.includes("coordinator")) {
    return { ok: false, message: "Action réservée à la coordination." };
  }

  const learnerId = String(formData.get("learnerId") ?? "");
  const raw = String(formData.get("status") ?? "");
  if (!learnerId || !STATUSES.includes(raw as StaffTalentStatus | "")) {
    return { ok: false, message: "Statut invalide." };
  }

  try {
    await setStaffTalentStatus(org.id, learnerId, (raw || null) as StaffTalentStatus | null);
  } catch {
    return { ok: false, message: "La mise à jour a échoué." };
  }
  revalidatePath(`/coordination/apprenants/${learnerId}`);
  return { ok: true, message: "Statut vivier mis à jour." };
}
