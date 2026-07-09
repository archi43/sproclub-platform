import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { adminClient } from "@/lib/supabase/admin";
import { fetchCommandes, AirtableNotConfiguredError } from "@/lib/sync/airtable-source";
import { syncCommandes } from "@/lib/sync/run";

/**
 * Airtable → Postgres sync trigger (cron / manual). Trusted server job with the
 * service-role client, protected by CRON_SECRET. Accepts Vercel Cron (GET +
 * Authorization Bearer) and manual calls (x-cron-secret). Airtable is read-only.
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

  const slug = process.env.DEV_DEFAULT_ORG_SLUG ?? process.env.PLATFORM_DEFAULT_ORG_SLUG ?? "sproclub";
  const admin = adminClient();

  const { data: org } = await admin.from("organizations").select("id").eq("slug", slug).single();
  if (!org) return NextResponse.json({ error: `org '${slug}' not found` }, { status: 404 });

  try {
    const source = await fetchCommandes();
    const stats = await syncCommandes(admin, org.id as string, source);
    return NextResponse.json({ ok: true, org: slug, stats });
  } catch (err) {
    if (err instanceof AirtableNotConfiguredError) {
      return NextResponse.json({ ok: false, error: err.message }, { status: 503 });
    }
    // Best-effort failure log for observability.
    await admin.from("sync_log").insert({
      entity: "commandes_formation",
      direction: "airtable_to_pg",
      status: "error",
      detail: err instanceof Error ? err.message : "sync failed",
    });
    const message = err instanceof Error ? err.message : "sync failed";
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}
