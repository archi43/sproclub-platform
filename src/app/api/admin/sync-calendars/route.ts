import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { adminClient } from "@/lib/supabase/admin";
import { syncCalendars } from "@/lib/calendar/sync";
import { logOpsEvent } from "@/lib/data/ops";

/**
 * Agendas externes → occupations, puis republication des créneaux (INC-19).
 * Job serveur de confiance (client service-role), protégé par CRON_SECRET.
 * Lecture seule côté agenda : on n'y écrit jamais.
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
  return run(request);
}
export async function POST(request: NextRequest) {
  return run(request);
}

async function run(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const slug = process.env.DEV_DEFAULT_ORG_SLUG ?? process.env.PLATFORM_DEFAULT_ORG_SLUG ?? "sproclub";
  const admin = adminClient();

  const { data: org } = await admin.from("organizations").select("id").eq("slug", slug).single();
  if (!org) return NextResponse.json({ error: `org '${slug}' not found` }, { status: 404 });
  const orgId = org.id as string;

  try {
    const results = await syncCalendars(admin, { orgId });
    const failed = results.filter((r) => !r.ok).length;
    const events = results.reduce((sum, r) => sum + r.events, 0);
    await logOpsEvent({
      orgId,
      level: failed > 0 ? "warn" : "info",
      source: "cron.calendars",
      message:
        failed > 0
          ? `Synchronisation des agendas partielle (${failed} flux en échec)`
          : "Synchronisation des agendas exécutée",
      // Pas d'URL ni d'identité dans le journal : le staff y a accès.
      detail: JSON.stringify({ feeds: results.length, failed, events }),
    });
    return NextResponse.json({ ok: true, org: slug, feeds: results.length, failed, events });
  } catch (err) {
    const message = err instanceof Error ? err.message : "calendar sync failed";
    await logOpsEvent({
      orgId,
      level: "error",
      source: "cron.calendars",
      message: "Échec de la synchronisation des agendas",
      detail: message,
    });
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}
