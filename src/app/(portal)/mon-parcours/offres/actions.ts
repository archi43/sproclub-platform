"use server";

import { revalidatePath } from "next/cache";
import { getOrgContext } from "@/lib/tenant";
import { getMyLearnerId, setMyInterest } from "@/lib/data/jobs";

export type InterestState = { ok: boolean; message: string };

/** L'apprenant marque ou retire son intérêt pour une offre publiée (un clic). */
export async function toggleInterestAction(_prev: InterestState, formData: FormData): Promise<InterestState> {
  const org = await getOrgContext();
  if (!org) return { ok: false, message: "Organisme introuvable." };
  const offerId = String(formData.get("offerId") ?? "");
  const interested = String(formData.get("interested") ?? "") === "true";
  if (!offerId) return { ok: false, message: "Offre introuvable." };

  const learnerId = await getMyLearnerId(org.id);
  if (!learnerId) return { ok: false, message: "Dossier apprenant introuvable." };

  try {
    await setMyInterest(org.id, learnerId, offerId, interested);
  } catch {
    return { ok: false, message: "L'action a échoué. Réessayez." };
  }
  revalidatePath("/mon-parcours/offres");
  return { ok: true, message: interested ? "Intérêt enregistré." : "Intérêt retiré." };
}
