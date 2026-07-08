import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Availability, BookingKind, Reservation } from "@/lib/types";

/**
 * Reservation data-access layer.
 *
 * Functions take an explicit SupabaseClient so the caller chooses the privilege
 * context: the authenticated user's client for student self-service (RLS +
 * booking triggers apply), or a trusted server client for the Cal.com sync job.
 * The database triggers from migration 0004 remain the authoritative guard for
 * every booking rule; this layer only surfaces readable domain errors.
 */

/** Available slots of a given kind for an organization. */
export async function getAvailabilities(
  supabase: SupabaseClient,
  orgId: string,
  kind: BookingKind
): Promise<Availability[]> {
  const { data, error } = await supabase
    .from("availabilities")
    .select("id, org_id, host_id, kind, starts_at, ends_at, calcom_ref")
    .eq("org_id", orgId)
    .eq("kind", kind)
    .order("starts_at", { ascending: true });
  if (error) throw new Error(`Failed to load availabilities: ${error.message}`);
  return (data ?? []) as Availability[];
}

/** Reservations visible to the current user within an organization. */
export async function getReservations(
  supabase: SupabaseClient,
  orgId: string
): Promise<Reservation[]> {
  const { data, error } = await supabase
    .from("reservations")
    .select(
      "id, org_id, learner_id, enrollment_id, kind, project_number, starts_at, ends_at, status, calcom_booking_id, created_at"
    )
    .eq("org_id", orgId)
    .order("starts_at", { ascending: true });
  if (error) throw new Error(`Failed to load reservations: ${error.message}`);
  return (data ?? []) as Reservation[];
}

export interface NewReservation {
  orgId: string;
  learnerId: string;
  enrollmentId: string;
  kind: BookingKind;
  projectNumber?: number; // required for defenses
  startsAt: string;
  endsAt: string;
  calcomBookingId?: string;
}

/**
 * Create a reservation. Booking rules (deliverable gate for defenses, org
 * consistency, one active defense per project) are enforced by DB triggers and
 * constraints; violations are turned into a `BookingError` here.
 */
export async function createReservation(
  supabase: SupabaseClient,
  input: NewReservation
): Promise<Reservation> {
  const { data, error } = await supabase
    .from("reservations")
    .insert({
      org_id: input.orgId,
      learner_id: input.learnerId,
      enrollment_id: input.enrollmentId,
      kind: input.kind,
      project_number: input.projectNumber ?? null,
      starts_at: input.startsAt,
      ends_at: input.endsAt,
      calcom_booking_id: input.calcomBookingId ?? null,
    })
    .select(
      "id, org_id, learner_id, enrollment_id, kind, project_number, starts_at, ends_at, status, calcom_booking_id, created_at"
    )
    .single();
  if (error) throw new BookingError(error.message);
  return data as Reservation;
}

/** A booking rule was violated (surfaced from a DB trigger / constraint). */
export class BookingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BookingError";
  }
}
