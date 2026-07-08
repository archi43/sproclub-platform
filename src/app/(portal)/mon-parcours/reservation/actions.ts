"use server";

import { revalidatePath } from "next/cache";
import { getOrgContext } from "@/lib/tenant";
import { createClient } from "@/lib/supabase/server";
import { setCurrentOrg } from "@/lib/data/org-context";
import { getMyEnrollmentRef } from "@/lib/data/enrollments";
import { createReservation, getAvailabilityById, BookingError } from "@/lib/data/reservations";

export type BookState = { ok: boolean; message: string };

/** Server action: a student books a coaching slot. */
export async function bookCoachingAction(
  _prev: BookState,
  formData: FormData
): Promise<BookState> {
  const org = await getOrgContext();
  if (!org) return { ok: false, message: "Organisme introuvable." };

  const availabilityId = String(formData.get("availabilityId") ?? "");
  if (!availabilityId) return { ok: false, message: "Créneau introuvable." };

  const ref = await getMyEnrollmentRef(org.id);
  if (!ref) return { ok: false, message: "Aucun dossier de formation associé à votre compte." };

  const supabase = createClient();
  await setCurrentOrg(supabase, org.id);

  const slot = await getAvailabilityById(supabase, org.id, availabilityId);
  if (!slot || slot.kind !== "coaching") {
    return { ok: false, message: "Ce créneau n'est plus disponible." };
  }

  try {
    await createReservation(supabase, {
      orgId: org.id,
      learnerId: ref.learnerId,
      enrollmentId: ref.enrollmentId,
      kind: "coaching",
      startsAt: slot.starts_at,
      endsAt: slot.ends_at,
    });
  } catch (err) {
    const message = err instanceof BookingError ? "Réservation impossible pour ce créneau." : "La réservation a échoué.";
    return { ok: false, message };
  }
  revalidatePath("/mon-parcours/reservation");
  return { ok: true, message: "Créneau de coaching réservé." };
}
