import "server-only";
import type { BookingKind } from "@/lib/types";
import {
  ProviderNotConfiguredError,
  type BookingProvider,
  type BookingRequest,
  type BookingResult,
  type Slot,
} from "@/lib/booking/provider";

/**
 * Cal.com adapter (server-only).
 *
 * Config comes from the environment for the pilot (single org). In production
 * the token is resolved per organization from the secret manager via
 * `connector_configs.secret_ref` — never stored in the database or the repo.
 *
 * Two event types back the two calendars: coaching and defense. Their ids are
 * non-secret settings and live in env / connector config.
 *
 * NOTE: the HTTP calls target Cal.com API v2 and are pending end-to-end
 * verification against real credentials (see SETUP.md, section Réservation).
 */
export interface CalcomConfig {
  apiBase: string; // e.g. https://api.cal.com/v2
  apiKey: string;
  eventTypeIds: Record<BookingKind, string>;
}

export function calcomConfigFromEnv(): CalcomConfig | null {
  const apiKey = process.env.CALCOM_API_KEY;
  const coaching = process.env.CALCOM_EVENT_TYPE_COACHING;
  const defense = process.env.CALCOM_EVENT_TYPE_DEFENSE;
  if (!apiKey || !coaching || !defense) return null;
  return {
    apiBase: process.env.CALCOM_API_BASE ?? "https://api.cal.com/v2",
    apiKey,
    eventTypeIds: { coaching, defense },
  };
}

export class CalcomProvider implements BookingProvider {
  constructor(private readonly config: CalcomConfig) {}

  private async call<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${this.config.apiBase}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        "Content-Type": "application/json",
        "cal-api-version": "2024-08-13",
        ...(init?.headers ?? {}),
      },
    });
    if (!res.ok) {
      throw new Error(`Cal.com API ${path} failed: ${res.status} ${await res.text()}`);
    }
    return (await res.json()) as T;
  }

  async listSlots(params: { kind: BookingKind; from: string; to: string }): Promise<Slot[]> {
    const eventTypeId = this.config.eventTypeIds[params.kind];
    const qs = new URLSearchParams({
      eventTypeId,
      startTime: params.from,
      endTime: params.to,
    });
    const data = await this.call<{ data?: { slots?: Record<string, { time: string }[]> } }>(
      `/slots?${qs.toString()}`
    );
    const byDay = data.data?.slots ?? {};
    return Object.values(byDay)
      .flat()
      .map((s) => ({
        ref: s.time,
        hostId: "", // resolved when mirroring into `availabilities`
        kind: params.kind,
        startsAt: s.time,
        endsAt: s.time, // duration applied by the event type; refined on mirror
      }));
  }

  async createBooking(request: BookingRequest): Promise<BookingResult> {
    const body = {
      eventTypeId: this.config.eventTypeIds[request.kind],
      start: request.slotRef,
      attendee: { email: request.learnerEmail, timeZone: "Europe/Paris" },
      guests: request.inviteeEmails ?? [],
      metadata: request.metadata ?? {},
    };
    const data = await this.call<{ data: { uid: string; start: string; end: string } }>(`/bookings`, {
      method: "POST",
      body: JSON.stringify(body),
    });
    return { providerBookingId: data.data.uid, startsAt: data.data.start, endsAt: data.data.end };
  }

  async cancelBooking(providerBookingId: string): Promise<void> {
    await this.call(`/bookings/${providerBookingId}/cancel`, { method: "POST" });
  }
}

/** Resolve the active booking provider, or throw if not yet configured. */
export function getBookingProvider(): BookingProvider {
  const config = calcomConfigFromEnv();
  if (!config) throw new ProviderNotConfiguredError("calcom");
  return new CalcomProvider(config);
}
