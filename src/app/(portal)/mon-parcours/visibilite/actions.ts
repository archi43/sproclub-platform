"use server";

import { revalidatePath } from "next/cache";
import { getOrgContext } from "@/lib/tenant";
import { saveMyTalentProfile } from "@/lib/data/talent";

export type VisibilityState = { ok: boolean; message: string };

/**
 * Server action (INC-17) : l'apprenant consent (ou révoque) sa visibilité aux
 * entreprises partenaires et déclare sa disponibilité. RLS student_manage.
 */
export async function saveVisibilityAction(_prev: VisibilityState, formData: FormData): Promise<VisibilityState> {
  const org = await getOrgContext();
  if (!org) return { ok: false, message: "Organisme introuvable." };

  const consent = formData.get("consent") === "on";
  const availableFrom = String(formData.get("availableFrom") ?? "").trim() || null;
  const contractSought = String(formData.get("contractSought") ?? "").trim() || null;
  const mobility = String(formData.get("mobility") ?? "").trim() || null;
  if (availableFrom && !/^\d{4}-\d{2}-\d{2}$/.test(availableFrom)) {
    return { ok: false, message: "Date de disponibilité invalide." };
  }

  try {
    await saveMyTalentProfile(org.id, { consent, availableFrom, contractSought, mobility });
  } catch {
    return { ok: false, message: "L'enregistrement a échoué. Réessayez." };
  }
  revalidatePath("/mon-parcours/visibilite");
  return {
    ok: true,
    message: consent
      ? "Profil visible des entreprises partenaires. Vous pouvez révoquer à tout moment."
      : "Profil masqué : les entreprises partenaires ne voient plus vos informations.",
  };
}
