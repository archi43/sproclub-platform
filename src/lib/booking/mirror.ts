import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getBookingProvider } from "@/lib/booking/calcom";
import type { BookingKind } from "@/lib/types";

/**
 * Availability mirror: pulls free slots from the booking provider (Cal.com) and
 * writes them into the `availabilities` read-model the portal reads from.
 *
 * Idempotent replace: for each org + kind, future rows previously mirrored
 * (calcom_ref prefixed `cal:`) are deleted and re-inserted from the current
 * provider state. Rows from other sources (e.g. demo seeds) are left untouched.
 * Runs with a trusted (service-role) client — it is a server-side job.
 */
export interface MirrorResult {
  kind: BookingKind;
  count: number;
}

export async function mirrorAvailabilities(
  admin: SupabaseClient,
  opts: { orgId: string; hostProfileId: string; from: string; to: string; kinds?: BookingKind[] }
): Promise<MirrorResult[]> {
  const provider = getBookingProvider();
  const kinds = opts.kinds ?? (["coaching", "defense"] as BookingKind[]);
  const nowIso = new Date().toISOString();
  const results: MirrorResult[] = [];

  for (const kind of kinds) {
    const slots = await provider.listSlots({ kind, from: opts.from, to: opts.to });

    const del = await admin
      .from("availabilities")
      .delete()
      .eq("org_id", opts.orgId)
      .eq("kind", kind)
      .gte("starts_at", nowIso)
      .like("calcom_ref", "cal:%");
    if (del.error) throw new Error(`mirror delete (${kind}): ${del.error.message}`);

    if (slots.length > 0) {
      const rows = slots.map((s) => ({
        org_id: opts.orgId,
        host_id: opts.hostProfileId,
        kind,
        starts_at: s.startsAt,
        ends_at: s.endsAt,
        calcom_ref: `cal:${s.ref}`,
      }));
      const ins = await admin.from("availabilities").insert(rows);
      if (ins.error) throw new Error(`mirror insert (${kind}): ${ins.error.message}`);
    }
    results.push({ kind, count: slots.length });
  }
  return results;
}
