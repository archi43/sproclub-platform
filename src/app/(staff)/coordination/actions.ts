"use server";

import { revalidatePath } from "next/cache";
import { getOrgContext } from "@/lib/tenant";
import { createClient } from "@/lib/supabase/server";

export type CoordState = { ok: boolean; message: string };

/**
 * Map a Postgres/PostgREST error to a user-facing message. The 0004 jury triggers
 * raise check_violation (23514) with explicit French messages we want to show;
 * everything else gets a generic message so raw DB errors never reach the UI.
 */
function friendlyError(error: { code?: string; message: string }): string {
  if (error.code === "23514" || error.code === "42501") return error.message;
  if (error.code === "23505") return "Cet évaluateur fait déjà partie du jury.";
  return "Action impossible pour le moment.";
}

/** Assign an evaluator to a defense jury. DB triggers (0004) enforce the rules:
 *  never the referent coach, pool membership, at most two evaluators. */
export async function assignEvaluatorAction(
  _prev: CoordState,
  formData: FormData
): Promise<CoordState> {
  const org = await getOrgContext();
  if (!org) return { ok: false, message: "Organisme introuvable." };

  const reservationId = String(formData.get("reservationId") ?? "");
  const evaluatorId = String(formData.get("evaluatorId") ?? "");
  if (!reservationId || !evaluatorId) return { ok: false, message: "Sélection incomplète." };

  const supabase = createClient();
  const { error } = await supabase
    .from("reservation_evaluators")
    .insert({ org_id: org.id, reservation_id: reservationId, evaluator_id: evaluatorId });

  if (error) return { ok: false, message: friendlyError(error) };
  revalidatePath("/coordination");
  return { ok: true, message: "Évaluateur ajouté au jury." };
}

/** Confirm a defense. The confirmation gate (0004) requires exactly two
 *  evaluators, none of whom is the referent coach. */
export async function confirmDefenseAction(
  _prev: CoordState,
  formData: FormData
): Promise<CoordState> {
  const org = await getOrgContext();
  if (!org) return { ok: false, message: "Organisme introuvable." };

  const reservationId = String(formData.get("reservationId") ?? "");
  if (!reservationId) return { ok: false, message: "Soutenance introuvable." };

  const supabase = createClient();
  const { error } = await supabase
    .from("reservations")
    .update({ status: "confirmed" })
    .eq("id", reservationId)
    .eq("org_id", org.id);

  if (error) return { ok: false, message: friendlyError(error) };
  revalidatePath("/coordination");
  return { ok: true, message: "Soutenance confirmée." };
}
