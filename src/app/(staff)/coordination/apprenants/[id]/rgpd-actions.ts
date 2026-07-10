"use server";

import { revalidatePath } from "next/cache";
import { getOrgContext } from "@/lib/tenant";
import { getCurrentUser, getRolesForOrg } from "@/lib/auth";
import { eraseLearner, logDossierAccess, RgpdError } from "@/lib/data/rgpd";

export type RgpdState = { ok: boolean; message: string };

/**
 * Right-to-erasure. DIRECTION only (the most sensitive, irreversible action);
 * it runs with the service role, so the role is re-checked here. A confirmation
 * word is required to avoid an accidental erasure. The action is audited.
 */
export async function eraseLearnerAction(_prev: RgpdState, formData: FormData): Promise<RgpdState> {
  const org = await getOrgContext();
  if (!org) return { ok: false, message: "Organisme introuvable." };
  const user = await getCurrentUser();
  if (!user) return { ok: false, message: "Session expirée, reconnectez-vous." };
  const roles = await getRolesForOrg(org.id);
  if (!roles.includes("direction")) {
    return { ok: false, message: "Seule la direction peut effacer un dossier." };
  }

  const learnerId = String(formData.get("learnerId") ?? "");
  const confirm = String(formData.get("confirm") ?? "").trim().toUpperCase();
  if (!learnerId) return { ok: false, message: "Apprenant introuvable." };
  if (confirm !== "EFFACER") return { ok: false, message: "Tapez EFFACER pour confirmer." };

  try {
    await eraseLearner(org.id, learnerId);
    await logDossierAccess("dossier.erase", learnerId, "Effacement (droit à l'oubli)");
  } catch (err) {
    return { ok: false, message: err instanceof RgpdError ? err.message : "Effacement impossible." };
  }
  revalidatePath(`/coordination/apprenants/${learnerId}`);
  return { ok: true, message: "Dossier anonymisé et suppression enregistrée." };
}
