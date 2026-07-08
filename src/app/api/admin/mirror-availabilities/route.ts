import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createClient as createAdmin } from "@supabase/supabase-js";
import { env, serviceRoleKey } from "@/lib/env";
import { mirrorAvailabilities } from "@/lib/booking/mirror";

/** Constant-time secret comparison (avoids leaking the secret via timing). */
function secretMatches(provided: string | null, expected: string): boolean {
  if (!provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Availability mirror trigger (cron / manual). Protected by a shared secret
 * (`x-cron-secret` == CRON_SECRET), not a user session: it runs as a trusted
 * server job with the service-role client. Intended to be called on a schedule.
 *
 * Pilot config from env: the SproCLUB org, the Cal.com host profile, a rolling
 * window (default 14 days). In production this becomes per-org connector config.
 */
export async function POST(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || !secretMatches(request.headers.get("x-cron-secret"), secret)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const hostProfileId = process.env.CALCOM_HOST_PROFILE_ID;
  if (!hostProfileId) {
    return NextResponse.json({ error: "CALCOM_HOST_PROFILE_ID not configured" }, { status: 500 });
  }

  const slug = process.env.DEV_DEFAULT_ORG_SLUG ?? "sproclub";
  // Clamp the window: default 14, bounded to [1, 60] (NaN falls back to 14).
  const days = Math.min(60, Math.max(1, Number(new URL(request.url).searchParams.get("days")) || 14));

  const admin = createAdmin(env.supabaseUrl, serviceRoleKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: org } = await admin.from("organizations").select("id").eq("slug", slug).single();
  if (!org) return NextResponse.json({ error: `org '${slug}' not found` }, { status: 404 });

  const from = new Date().toISOString().slice(0, 10);
  const to = new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

  try {
    const results = await mirrorAvailabilities(admin, { orgId: org.id, hostProfileId, from, to });
    return NextResponse.json({ ok: true, org: slug, from, to, results });
  } catch (err) {
    const message = err instanceof Error ? err.message : "mirror failed";
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}
