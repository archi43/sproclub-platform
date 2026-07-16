"use server";

import { revalidatePath } from "next/cache";
import { getOrgContext } from "@/lib/tenant";
import { getCurrentUser, getRolesForOrg } from "@/lib/auth";
import { setOfferStatus, setTrainingNeedStatus, type TrainingNeedStatus } from "@/lib/data/jobs";
import { canTransition, type JobStatus } from "@/lib/job-rules";

export type ModerationState = { ok: boolean; message: string };

const PATH = "/coordination/recrutement";

async function staffCtx() {
  const org = await getOrgContext();
  const user = await getCurrentUser();
  if (!org || !user) return null;
  const roles = await getRolesForOrg(org.id);
  if (!roles.includes("direction") && !roles.includes("coordinator")) return null;
  return { orgId: org.id, userId: user.id };
}

/** Modérer une offre : publier / rejeter (motif) / archiver / republier. */
export async function moderateOfferAction(_prev: ModerationState, formData: FormData): Promise<ModerationState> {
  const ctx = await staffCtx();
  if (!ctx) return { ok: false, message: "Action réservée à la coordination." };
  const offerId = String(formData.get("offerId") ?? "");
  const from = String(formData.get("from") ?? "") as JobStatus;
  const to = String(formData.get("to") ?? "") as JobStatus;
  const note = String(formData.get("note") ?? "").trim() || null;
  if (!offerId || !canTransition("staff", from, to)) {
    return { ok: false, message: "Transition non autorisée." };
  }
  try {
    await setOfferStatus(ctx.orgId, offerId, to, { moderatedBy: ctx.userId, note: to === "rejected" ? note : null });
  } catch {
    return { ok: false, message: "La modération a échoué." };
  }
  revalidatePath(PATH);
  const labels: Record<string, string> = { published: "publiée", rejected: "rejetée", archived: "archivée" };
  return { ok: true, message: `Offre ${labels[to] ?? "mise à jour"}.` };
}

/** Mettre à jour le statut de suivi d'un besoin de formation. */
export async function reviewNeedAction(_prev: ModerationState, formData: FormData): Promise<ModerationState> {
  const ctx = await staffCtx();
  if (!ctx) return { ok: false, message: "Action réservée à la coordination." };
  const needId = String(formData.get("needId") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!needId || !["open", "reviewed", "closed"].includes(status)) {
    return { ok: false, message: "Statut invalide." };
  }
  try {
    await setTrainingNeedStatus(ctx.orgId, needId, status as TrainingNeedStatus);
  } catch {
    return { ok: false, message: "La mise à jour a échoué." };
  }
  revalidatePath(PATH);
  return { ok: true, message: "Besoin mis à jour." };
}
