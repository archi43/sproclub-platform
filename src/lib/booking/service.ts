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
