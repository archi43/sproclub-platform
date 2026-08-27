import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { adminClient } from "@/lib/supabase/admin";
import { runAirtableSync } from "@/lib/sync/pipeline";

/**
 * Déclencheur Airtable → Postgres (cron). Job serveur de confiance, client
 * service-role, protégé par `CRON_SECRET`. Accepte le cron Vercel (GET +
 * Authorization Bearer) et l'appel manuel (`x-cron-secret`). Airtable est lu
 * seul ; le seul retour sortant est le write-back en création.
 *
 * La séquence elle-même vit dans `@/lib/sync/pipeline` : l'écran Exploitation
 * la déclenche par le même chemin, derrière une garde de rôle.
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

  const result = await runAirtableSync(admin, org.id as string, slug, "cron");
  if (result.ok) return NextResponse.json(result);
  return NextResponse.json(result, { status: result.notConfigured ? 503 : 502 });
}
