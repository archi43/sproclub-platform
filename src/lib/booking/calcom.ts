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
 * Cal.com adapter (server-only), validated against the Cal.eu (EU region) v2 API.
 *
 * Config comes from the environment for the pilot (single org). In production
 * the token is resolved per organization from the secret manager via
 * `connector_configs.secret_ref` — never stored in the database or the repo.
 *
 * Two event types back the two calendars: coaching and defense. Their ids are
 * non-secret settings and live in env / connector config.
 *
 * Cal.com v2 versions endpoints independently, so each call sends its own
 * `cal-api-version`. Shapes below were verified against the live API:
 *   - GET  /slots     → params `start`/`end`; body `{ data: { "<day>": [{ start }] } }`
 *   - POST /bookings  → `{ start, eventTypeId, attendee }`; body `{ data: { uid, start, end } }`
 */
export interface CalcomConfig {
  apiBase: string; // e.g. https://api.cal.eu/v2 (EU) or https://api.cal.com/v2
  apiKey: string;
  eventTypeIds: Record<BookingKind, string>;
}

export function calcomConfigFromEnv(): CalcomConfig | null {
  const apiKey = process.env.CALCOM_API_KEY;
  const coaching = process.env.CALCOM_EVENT_TYPE_COACHING;
  const defense = process.env.CALCOM_EVENT_TYPE_DEFENSE;
  if (!apiKey || !coaching || !defense) return null;
  return {
    apiBase: process.env.CALCOM_API_BASE ?? "https://api.cal.eu/v2",
    apiKey,
    eventTypeIds: { coaching, defense },
  };
}

/** Slots endpoint returns times grouped by day: { "2026-07-13": [{ start }] }. */
type SlotsResponse = { data?: Record<string, { start: string }[]> };
type BookingResponse = { data: { uid: string; start: string; end: string } };

export class CalcomProvider implements BookingProvider {
  constructor(private readonly config: CalcomConfig) {}

  private async call<T>(path: string, version: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${this.config.apiBase}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        "Content-Type": "application/json",
        "cal-api-version": version,
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
    const qs = new URLSearchParams({ eventTypeId, start: params.from, end: params.to });
    const body = await this.call<SlotsResponse>(`/slots?${qs.toString()}`, "2024-09-04");
    const byDay = body.data ?? {};
    return Object.values(byDay)
      .flat()
      .map((s) => ({
        ref: s.start,
        hostId: "", // resolved when mirroring into `availabilities`
        kind: params.kind,
        startsAt: s.start,
        // Slots expose only the start; the end is start + event-type length,
        // applied when mirroring (the event-type duration is known there).
        endsAt: s.start,
      }));
  }

  async createBooking(request: BookingRequest): Promise<BookingResult> {
    const body = {
      eventTypeId: Number(this.config.eventTypeIds[request.kind]),
      start: request.slotRef,
      attendee: { name: request.learnerEmail, email: request.learnerEmail, timeZone: "Europe/Paris" },
      guests: request.inviteeEmails ?? [],
      metadata: request.metadata ?? {},
    };
    const data = await this.call<BookingResponse>(`/bookings`, "2024-08-13", {
      method: "POST",
      body: JSON.stringify(body),
    });
    return { providerBookingId: data.data.uid, startsAt: data.data.start, endsAt: data.data.end };
  }

  async cancelBooking(providerBookingId: string): Promise<void> {
    await this.call(`/bookings/${providerBookingId}/cancel`, "2024-08-13", { method: "POST" });
  }
}

/** Resolve the active booking provider, or throw if not yet configured. */
export function getBookingProvider(): BookingProvider {
  const config = calcomConfigFromEnv();
  if (!config) throw new ProviderNotConfiguredError("calcom");
  return new CalcomProvider(config);
}
