"use server";

import { revalidatePath } from "next/cache";
import { getOrgContext } from "@/lib/tenant";
import { getCurrentUser, getRolesForOrg } from "@/lib/auth";
import { getMyPartnerCompany } from "@/lib/data/talent";
import { createTrainingNeed } from "@/lib/data/jobs";

export type NeedActionState = { ok: boolean; message: string };

/** Le partenaire exprime un besoin de formation (signal vers la coordination). */
export async function createTrainingNeedAction(_prev: NeedActionState, formData: FormData): Promise<NeedActionState> {
  const org = await getOrgContext();
  const user = await getCurrentUser();
  if (!org || !user) return { ok: false, message: "Session invalide." };
  const roles = await getRolesForOrg(org.id);
  if (!roles.includes("partner")) return { ok: false, message: "Action réservée aux entreprises partenaires." };
  const company = await getMyPartnerCompany(org.id);
  if (!company) return { ok: false, message: "Aucune entreprise de rattachement." };

  const title = String(formData.get("title") ?? "").trim();
  if (!title) return { ok: false, message: "Précisez la compétence ou le domaine visé." };
  if (title.length > 200) return { ok: false, message: "L'intitulé est trop long (200 caractères max)." };
  const description = String(formData.get("description") ?? "").trim();
  if (description.length > 5000) return { ok: false, message: "La description est trop longue (5000 caractères max)." };
  const headcountRaw = String(formData.get("headcount") ?? "").trim();
  const headcount = headcountRaw ? Number.parseInt(headcountRaw, 10) : null;
  if (headcount !== null && (!Number.isInteger(headcount) || headcount <= 0)) {
    return { ok: false, message: "Le nombre de profils doit être un entier positif." };
  }

  try {
    await createTrainingNeed(org.id, company.id, {
      title,
      description: description || null,
      headcount,
      timeframe: String(formData.get("timeframe") ?? "").trim() || null,
    });
  } catch {
    return { ok: false, message: "L'enregistrement a échoué." };
  }
  revalidatePath("/besoins");
  return { ok: true, message: "Besoin transmis à l'équipe pédagogique SproCLUB." };
}
