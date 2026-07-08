"use server";

import { revalidatePath } from "next/cache";
import { getOrgContext } from "@/lib/tenant";
import { submitDeliverable } from "@/lib/data/deliverables";

export type SubmitState = { ok: boolean; message: string };

/** Server action: a student submits a project deliverable (URL of the work). */
export async function submitDeliverableAction(
  _prev: SubmitState,
  formData: FormData
): Promise<SubmitState> {
  const org = await getOrgContext();
  if (!org) return { ok: false, message: "Organisme introuvable." };

  const deliverableId = String(formData.get("deliverableId") ?? "");
  const url = String(formData.get("url") ?? "").trim();
  if (!deliverableId) return { ok: false, message: "Livrable introuvable." };
  if (!/^https?:\/\/.+/i.test(url)) {
    return { ok: false, message: "Veuillez saisir un lien valide (https://…)." };
  }

  try {
    await submitDeliverable(org.id, deliverableId, url);
  } catch {
    return { ok: false, message: "Le dépôt a échoué. Réessayez." };
  }
  revalidatePath("/mon-parcours/livrables");
  return { ok: true, message: "Livrable déposé. La réservation de soutenance est ouverte." };
}
