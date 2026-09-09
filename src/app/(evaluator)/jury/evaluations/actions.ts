"use server";

import { revalidatePath } from "next/cache";
import { getOrgContext } from "@/lib/tenant";
import { requireOrgRole, getCurrentUser } from "@/lib/auth";
import { saveMyEvaluation, JuryError } from "@/lib/data/jury";
import { validateEvaluation, parseGrade } from "@/lib/jury-rules";

export interface EvaluationState {
  ok: boolean;
  message: string;
}

/**
 * Dépôt de l'appréciation d'un membre du jury (INC-28).
 *
 * L'auteur vient **de la session**, jamais du formulaire : c'est ce qui rend
 * l'usurpation impossible côté serveur, la RLS le revérifiant en base.
 */
export async function submitEvaluation(_prev: EvaluationState, formData: FormData): Promise<EvaluationState> {
  const org = await getOrgContext();
  if (!org) return { ok: false, message: "Organisme introuvable." };

  await requireOrgRole(org.id, ["evaluator"]);
  const user = await getCurrentUser();
  if (!user) return { ok: false, message: "Session expirée, reconnectez-vous." };

  const reservationId = String(formData.get("reservationId") ?? "");
  const enrollmentId = String(formData.get("enrollmentId") ?? "");
  const sessionDate = String(formData.get("sessionDate") ?? "").slice(0, 10);
  const comment = String(formData.get("comment") ?? "");
  const rawGrade = String(formData.get("grade") ?? "");

  if (!reservationId || !enrollmentId) return { ok: false, message: "Soutenance introuvable." };

  const rejection = validateEvaluation({ grade: rawGrade, comment });
  if (rejection) return { ok: false, message: rejection.message };

  try {
    await saveMyEvaluation(
      org.id,
      {
        reservationId,
        enrollmentId,
        grade: parseGrade(rawGrade)!,
        body: comment.trim(),
        sessionDate: sessionDate || new Date().toISOString().slice(0, 10),
      },
      user.id
    );
  } catch (err) {
    if (err instanceof JuryError) return { ok: false, message: err.message };
    throw err;
  }

  revalidatePath("/jury/evaluations");
  return { ok: true, message: "Appréciation enregistrée." };
}
