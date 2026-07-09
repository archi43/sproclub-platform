"use server";

import { revalidatePath } from "next/cache";
import { getOrgContext } from "@/lib/tenant";
import { getCurrentUser } from "@/lib/auth";
import { createReport, CoachError } from "@/lib/data/coaching";

export type ReportState = { ok: boolean; message: string };

/** Save a coaching report / note. RLS enforces that the enrollment is the
 *  caller-coach's and that the author is the caller. */
export async function createReportAction(_prev: ReportState, formData: FormData): Promise<ReportState> {
  const org = await getOrgContext();
  if (!org) return { ok: false, message: "Organisme introuvable." };
  const user = await getCurrentUser();
  if (!user) return { ok: false, message: "Session expirée, reconnectez-vous." };

  const enrollmentId = String(formData.get("enrollmentId") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  const sessionDate = String(formData.get("sessionDate") ?? "").trim() || null;
  const gradeRaw = String(formData.get("grade") ?? "").trim();
  if (!enrollmentId) return { ok: false, message: "Dossier introuvable." };
  if (!body) return { ok: false, message: "Le compte rendu ne peut pas être vide." };

  let grade: number | null = null;
  if (gradeRaw) {
    const n = Number(gradeRaw.replace(",", "."));
    if (Number.isNaN(n)) return { ok: false, message: "La note doit être un nombre." };
    grade = n;
  }

  try {
    await createReport(org.id, { enrollmentId, body, sessionDate, grade }, user.id);
  } catch (err) {
    return { ok: false, message: err instanceof CoachError ? err.message : "Erreur inattendue." };
  }
  revalidatePath(`/coaching/${enrollmentId}`);
  return { ok: true, message: "Compte rendu enregistré." };
}
