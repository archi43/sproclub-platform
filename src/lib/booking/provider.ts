import type { BookingKind } from "@/lib/types";

/**
 * Booking provider PORT (hexagonal boundary).
 *
 * The reservation domain depends on this interface, never on a concrete
 * scheduling vendor. Cal.com is the first adapter (two event types: coaching
 * and defense / jury of two). Swapping providers, or adding a second one per
 * organization, is a matter of another adapter — no domain change.
 */

export interface Slot {
  /** Provider-side reference for the slot / event type occurrence. */
  ref: string;
  hostId: string;
  kind: BookingKind;
  startsAt: string; // ISO 8601 (UTC)
  endsAt: string; // ISO 8601 (UTC)
}

export interface BookingRequest {
  slotRef: string;
  kind: BookingKind;
  learnerEmail: string;
  /** Additional invitees, e.g. the two evaluators for a defense. */
  inviteeEmails?: string[];
  metadata?: Record<string, string>;
}

export interface BookingResult {
  providerBookingId: string;
  startsAt: string;
  endsAt: string;
}

export interface BookingProvider {
  /** Free slots of a given kind within a window. */
  listSlots(params: { kind: BookingKind; from: string; to: string }): Promise<Slot[]>;
  /** Create a booking on the provider; returns the provider booking id. */
  createBooking(request: BookingRequest): Promise<BookingResult>;
  /** Cancel a previously created booking. */
  cancelBooking(providerBookingId: string): Promise<void>;
  /** Add guests (e.g. the two defense evaluators) to an existing booking. Used
   *  at jury confirmation, since the defense is booked before the jury is set.
   *  Best-effort at the call site — not all providers support post-hoc edits. */
  addGuests(providerBookingId: string, guestEmails: string[]): Promise<void>;
}

/** Raised when a provider is selected but not yet configured (missing keys). */
export class ProviderNotConfiguredError extends Error {
  constructor(provider: string) {
    super(`Booking provider "${provider}" is not configured (missing API credentials).`);
    this.name = "ProviderNotConfiguredError";
  }
}
