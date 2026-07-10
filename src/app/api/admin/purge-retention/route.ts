import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { adminClient } from "@/lib/supabase/admin";
import { logOpsEvent } from "@/lib/data/ops";

/**
 * Retention purge (INC-12; completes the deferred INC-11 automatic purge).
 * Trusted server job (service-role, bypasses RLS by design) protected by
 * CRON_SECRET, scheduled in vercel.json. Deletes time-expired operational data
 * per the policy in RETENTION.md:
 *   - audit_log        : 12 months (traçabilité RGPD glissante)
 *   - ops_events       : 90 days
 *   - rate_limit_events: 2 days (well beyond any active window)
 * Anonymized learner rows are NOT touched (retention of Qualiopi/BPF evidence is
 * a separate, longer policy handled elsewhere).
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

const DAY = 86_400_000;

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

  const admin = adminClient();
  const now = Date.now();
  const targets: { table: string; column: string; cutoff: string }[] = [
    { table: "audit_log", column: "at", cutoff: new Date(now - 365 * DAY).toISOString() },
    { table: "ops_events", column: "at", cutoff: new Date(now - 90 * DAY).toISOString() },
    { table: "rate_limit_events", column: "at", cutoff: new Date(now - 2 * DAY).toISOString() },
  ];

  const purged: Record<string, number> = {};
  try {
    for (const t of targets) {
      const { count } = await admin
        .from(t.table)
        .select("id", { count: "exact", head: true })
        .lt(t.column, t.cutoff);
      const { error } = await admin.from(t.table).delete().lt(t.column, t.cutoff);
      if (error) throw new Error(`${t.table}: ${error.message}`);
      purged[t.table] = count ?? 0;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "purge failed";
    const slug = process.env.DEV_DEFAULT_ORG_SLUG ?? process.env.PLATFORM_DEFAULT_ORG_SLUG ?? "sproclub";
    const { data: org } = await admin.from("organizations").select("id").eq("slug", slug).single();
    if (org) await logOpsEvent({ orgId: org.id as string, level: "error", source: "cron.purge", message: "Échec de la purge de rétention", detail: message });
    return NextResponse.json({ ok: false, error: message, purged }, { status: 500 });
  }

  // Record a summary for observability, attributed to the default org.
  const slug = process.env.DEV_DEFAULT_ORG_SLUG ?? process.env.PLATFORM_DEFAULT_ORG_SLUG ?? "sproclub";
  const { data: org } = await admin.from("organizations").select("id").eq("slug", slug).single();
  if (org) {
    await logOpsEvent({
      orgId: org.id as string,
      level: "info",
      source: "cron.purge",
      message: "Purge de rétention effectuée",
      detail: Object.entries(purged).map(([k, v]) => `${k}=${v}`).join(", "),
    });
  }

  return NextResponse.json({ ok: true, purged });
}
