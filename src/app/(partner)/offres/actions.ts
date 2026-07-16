"use server";

import { revalidatePath } from "next/cache";
import { getOrgContext } from "@/lib/tenant";
import { getCurrentUser, getRolesForOrg } from "@/lib/auth";
import { getMyPartnerCompany } from "@/lib/data/talent";
import { createOffer, setOfferStatus } from "@/lib/data/jobs";

export type OfferActionState = { ok: boolean; message: string };

async function partnerContext() {
  const org = await getOrgContext();
  const user = await getCurrentUser();
  if (!org || !user) return null;
  const roles = await getRolesForOrg(org.id);
  if (!roles.includes("partner")) return null;
  return { orgId: org.id };
}

/** Le partenaire publie une nouvelle offre (soumise en modération). */
export async function createOfferAction(_prev: OfferActionState, formData: FormData): Promise<OfferActionState> {
  const ctx = await partnerContext();
  if (!ctx) return { ok: false, message: "Action réservée aux entreprises partenaires." };
  const company = await getMyPartnerCompany(ctx.orgId);
  if (!company) return { ok: false, message: "Aucune entreprise de rattachement." };

  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  if (!title || !description) return { ok: false, message: "Titre et description sont requis." };
  if (title.length > 200) return { ok: false, message: "L'intitulé est trop long (200 caractères max)." };
  if (description.length > 5000) return { ok: false, message: "La description est trop longue (5000 caractères max)." };

  try {
    await createOffer(ctx.orgId, company.id, {
      title,
      description,
      contractType: String(formData.get("contractType") ?? "").trim() || null,
      location: String(formData.get("location") ?? "").trim() || null,
      remote: String(formData.get("remote") ?? "").trim() || null,
    });
  } catch {
    return { ok: false, message: "La création a échoué." };
  }
  revalidatePath("/offres");
  return { ok: true, message: "Offre soumise. Elle sera visible des apprenants après validation par la coordination." };
}

/** Le partenaire archive son offre ou re-soumet une offre rejetée. */
export async function partnerOfferTransitionAction(_prev: OfferActionState, formData: FormData): Promise<OfferActionState> {
  const ctx = await partnerContext();
  if (!ctx) return { ok: false, message: "Action réservée aux entreprises partenaires." };
  const offerId = String(formData.get("offerId") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!offerId || (status !== "archived" && status !== "pending")) {
    return { ok: false, message: "Transition non autorisée." };
  }
  try {
    // Le trigger 0026 rejette toute transition interdite au partenaire.
    await setOfferStatus(ctx.orgId, offerId, status as "archived" | "pending");
  } catch {
    return { ok: false, message: "La mise à jour a échoué." };
  }
  revalidatePath("/offres");
  return { ok: true, message: status === "pending" ? "Offre re-soumise à la validation." : "Offre archivée." };
}
