import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Availability, BookingKind, Reservation } from "@/lib/types";
import { createReservation } from "@/lib/data/reservations";
import { getBookingProvider } from "@/lib/booking/calcom";
import { ProviderNotConfiguredError, type BookingProvider } from "@/lib/booking/provider";

/**
 * Booking orchestration: create the provider (Cal.com) booking first, then
 * record the reservation with its `calcom_booking_id`. If the DB write fails
 * after the provider booking succeeded, the provider booking is cancelled
 * (compensating action) so the calendar is never left with an orphan event.
 *
 * Degrades gracefully: if the provider is not configured, or the slot is not
 * provider-backed (no `cal:` ref), the reservation is recorded DB-only — the
 * app keeps working without Cal.com.
 */
export interface BookSlotInput {
  orgId: string;
  learnerId: string;
  enrollmentId: string;
  learnerEmail: string;
  kind: BookingKind;
  projectNumber?: number;
  availability: Availability;
}

function resolveProvider(): BookingProvider | null {
  try {
    return getBookingProvider();
  } catch (err) {
    if (err instanceof ProviderNotConfiguredError) return null;
    throw err;
  }
}

export async function bookSlot(supabase: SupabaseClient, input: BookSlotInput): Promise<Reservation> {
  const { availability } = input;
  const provider = resolveProvider();
  const calBacked = availability.calcom_ref?.startsWith("cal:") ?? false;

  let calcomBookingId: string | undefined;
  if (provider && calBacked) {
    const booking = await provider.createBooking({
      slotRef: availability.calcom_ref!.slice("cal:".length),
      kind: input.kind,
      learnerEmail: input.learnerEmail,
      // Jury guests are added when coordination assigns evaluators, not at booking.
      inviteeEmails: [],
      metadata: { orgId: input.orgId, enrollmentId: input.enrollmentId },
    });
    calcomBookingId = booking.providerBookingId;
  }

  try {
    return await createReservation(supabase, {
      orgId: input.orgId,
      learnerId: input.learnerId,
      enrollmentId: input.enrollmentId,
      kind: input.kind,
      projectNumber: input.projectNumber,
      startsAt: availability.starts_at,
      endsAt: availability.ends_at,
      calcomBookingId,
    });
  } catch (err) {
    if (provider && calcomBookingId) {
      // Best-effort compensation; do not mask the original error.
      try {
        await provider.cancelBooking(calcomBookingId);
      } catch {
        /* leave a note for the sync log later; original error is what matters */
      }
    }
    throw err;
  }
}

/**
 * Add a confirmed defense's two evaluators as guests on its Cal.eu event
 * (Étape 3 — closes the booking loop). BEST-EFFORT: never throws, so a
 * calendar-side failure can't roll back a confirmation that already succeeded
 * in the DB. No-op when Cal.com is not configured or the reservation has no
 * provider booking. `supabase` must be able to read the jury (staff RLS).
 */
export async function addJuryGuests(
  supabase: SupabaseClient,
  orgId: string,
  reservationId: string
): Promise<void> {
  const provider = resolveProvider();
  if (!provider) return;

  const { data } = await supabase
    .from("reservations")
    .select("calcom_booking_id, evaluators:reservation_evaluators(evaluator:profiles(email))")
    .eq("org_id", orgId)
    .eq("id", reservationId)
    .maybeSingle();

  const row = data as { calcom_booking_id: string | null; evaluators: { evaluator: { email: string } | null }[] | null } | null;
  const bookingId = row?.calcom_booking_id;
  if (!bookingId) return;

  const emails = (row?.evaluators ?? [])
    .map((e) => e.evaluator?.email)
    .filter((e): e is string => !!e);
  if (emails.length === 0) return;

  try {
    await provider.addGuests(bookingId, emails);
  } catch {
    /* best-effort; the confirmation stands. A later reconcile can retry. */
  }
}
