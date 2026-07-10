import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { adminClient } from "@/lib/supabase/admin";
import { runNotifications } from "@/lib/data/notifications";
import { logOpsEvent } from "@/lib/data/ops";

/**
 * Notifications & relances trigger (cron / manual). Trusted server job
 * (service-role, bypasses RLS by design) protected by CRON_SECRET, scheduled in
 * vercel.json. Gathers due reminders, enqueues them idempotently, dispatches the
 * pending ones. Degrades gracefully if no mailer is configured (rows stay
 * pending). A summary is recorded in the operational journal (INC-12).
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
    const result = await runNotifications(orgId, { admin });
    const detail = `enqueued=${result.enqueued}, sent=${result.sent}, skipped=${result.skipped}, errors=${result.errors}, pending=${result.pending}, mailer=${result.mailerConfigured}`;
    await logOpsEvent({
      orgId,
      level: result.errors > 0 ? "warn" : "info",
      source: "cron.notifications",
      message: "Relances traitées",
      detail,
    });
    return NextResponse.json({ ok: true, org: slug, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "notifications failed";
    await logOpsEvent({ orgId, level: "error", source: "cron.notifications", message: "Échec du traitement des relances", detail: message });
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
