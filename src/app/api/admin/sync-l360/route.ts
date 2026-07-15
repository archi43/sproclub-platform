import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { adminClient } from "@/lib/supabase/admin";
import { isL360Configured, l360Client, L360NotConfiguredError } from "@/lib/l360/client";
import { syncL360 } from "@/lib/l360/sync";
import { logOpsEvent } from "@/lib/data/ops";

/**
 * 360Learning → Postgres sync trigger (cron horaire / manuel). INC-15 : reflète
 * dépôt et validation JURY des livrables de projet. Trusted server job with the
 * service-role client, protected by CRON_SECRET. 360Learning is read-only.
 */
function secretMatches(provided: string | null, expected: string): boolean {
  if (!provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? null;
  return secretMatches(request.headers.get("x-cron-secret"), secret) || secretMatches(bearer, secret);
}

export async function GET(request: NextRequest) {
  return runSync(request);
}
export async function POST(request: NextRequest) {
  return runSync(request);
}

async function runSync(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Dégradation propre : sans credentials 360L, le cron répond 503 sans bruit.
  if (!isL360Configured()) {
    return NextResponse.json({ ok: false, error: new L360NotConfiguredError().message }, { status: 503 });
  }

  const slug = process.env.DEV_DEFAULT_ORG_SLUG ?? process.env.PLATFORM_DEFAULT_ORG_SLUG ?? "sproclub";
  const admin = adminClient();

  const { data: org } = await admin.from("organizations").select("id").eq("slug", slug).single();
  if (!org) return NextResponse.json({ error: `org '${slug}' not found` }, { status: 404 });
  const orgId = org.id as string;

  try {
    const stats = await syncL360(admin, orgId, l360Client());
    await logOpsEvent({
      orgId,
      level: stats.fetchErrors > 0 ? "warn" : "info",
      source: "cron.l360",
      message:
        stats.fetchErrors > 0
          ? `Synchronisation 360Learning partielle (${stats.fetchErrors} appel(s) 360L en échec)`
          : "Synchronisation 360Learning (livrables) exécutée",
      detail: JSON.stringify(stats),
    });
    return NextResponse.json({ ok: true, org: slug, stats });
  } catch (err) {
    const message = err instanceof Error ? err.message : "l360 sync failed";
    await admin.from("sync_log").insert({
      entity: "l360_projects",
      direction: "l360_to_pg",
      status: "error",
      detail: message,
    });
    await logOpsEvent({ orgId, level: "error", source: "cron.l360", message: "Échec de la synchronisation 360Learning", detail: message });
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}
