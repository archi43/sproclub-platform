"use server";

import { revalidatePath } from "next/cache";
import { getOrgContext } from "@/lib/tenant";
import { createClient } from "@/lib/supabase/server";
import { getMyEnrollmentRef } from "@/lib/data/enrollments";
import { getAvailabilityById, BookingError } from "@/lib/data/reservations";
import { bookSlot } from "@/lib/booking/service";

export type BookState = { ok: boolean; message: string };

/** Server action: a student books a coaching slot (creates the Cal.com event too). */
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
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const slot = await getAvailabilityById(supabase, org.id, availabilityId);
  if (!slot || slot.kind !== "coaching") {
    return { ok: false, message: "Ce créneau n'est plus disponible." };
  }

  try {
    await bookSlot(supabase, {
      orgId: org.id,
      learnerId: ref.learnerId,
      enrollmentId: ref.enrollmentId,
      learnerEmail: user?.email ?? "",
      kind: "coaching",
      availability: slot,
    });
  } catch (err) {
    const message = err instanceof BookingError ? "Réservation impossible pour ce créneau." : "La réservation a échoué.";
    return { ok: false, message };
  }
  revalidatePath("/mon-parcours/reservation");
  return { ok: true, message: "Créneau de coaching réservé." };
}
