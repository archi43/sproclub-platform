"use server";

import { revalidatePath } from "next/cache";
import { getOrgContext } from "@/lib/tenant";
import { createClient } from "@/lib/supabase/server";
import { getMyEnrollmentRef } from "@/lib/data/enrollments";
import { createReservation, getAvailabilityById, BookingError } from "@/lib/data/reservations";

export type DefenseState = { ok: boolean; message: string };

/**
 * Server action: a student books a defense (soutenance) for a project.
 * The database enforces that the project's deliverable is submitted and that a
 * project has at most one active defense; violations surface as a clean message.
 */
export async function bookDefenseAction(
  _prev: DefenseState,
  formData: FormData
): Promise<DefenseState> {
  const org = await getOrgContext();
  if (!org) return { ok: false, message: "Organisme introuvable." };

  const availabilityId = String(formData.get("availabilityId") ?? "");
  const projectNumber = Number(formData.get("projectNumber"));
  if (!availabilityId) return { ok: false, message: "Veuillez choisir un créneau." };
  if (!Number.isInteger(projectNumber)) return { ok: false, message: "Projet invalide." };

  const ref = await getMyEnrollmentRef(org.id);
  if (!ref) return { ok: false, message: "Aucun dossier de formation associé à votre compte." };

  const supabase = createClient();
  const slot = await getAvailabilityById(supabase, org.id, availabilityId);
  if (!slot || slot.kind !== "defense") {
    return { ok: false, message: "Ce créneau n'est plus disponible." };
  }

  try {
    await createReservation(supabase, {
      orgId: org.id,
      learnerId: ref.learnerId,
      enrollmentId: ref.enrollmentId,
      kind: "defense",
      projectNumber,
      startsAt: slot.starts_at,
      endsAt: slot.ends_at,
    });
  } catch (err) {
    const message = err instanceof BookingError
      ? "Réservation impossible : livrable non déposé, ou une soutenance existe déjà pour ce projet."
      : "La réservation a échoué.";
    return { ok: false, message };
  }
  revalidatePath("/mon-parcours/soutenance");
  return { ok: true, message: "Soutenance réservée. Le jury sera affecté par la coordination." };
}
