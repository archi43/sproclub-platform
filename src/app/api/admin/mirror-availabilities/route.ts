import { NextResponse, type NextRequest } from "next/server";
import { createClient as createAdmin } from "@supabase/supabase-js";
import { env, serviceRoleKey } from "@/lib/env";
import { mirrorAvailabilities } from "@/lib/booking/mirror";

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
  if (!secret || request.headers.get("x-cron-secret") !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const hostProfileId = process.env.CALCOM_HOST_PROFILE_ID;
  if (!hostProfileId) {
    return NextResponse.json({ error: "CALCOM_HOST_PROFILE_ID not configured" }, { status: 500 });
  }

  const slug = process.env.DEV_DEFAULT_ORG_SLUG ?? "sproclub";
  const days = Number(new URL(request.url).searchParams.get("days") ?? "14");

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
