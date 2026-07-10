import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { adminClient } from "@/lib/supabase/admin";
import { buildExportCsv } from "@/lib/data/reporting";
import { logOpsEvent } from "@/lib/data/ops";

/**
 * Periodic regulatory export (Module 5). Trusted server job (service-role
 * client, bypasses RLS by design) protected by CRON_SECRET, scheduled in
 * vercel.json. Generates the full dossier export for the default org and records
 * it in `sync_log` (direction=pg_to_airtable is for write-backs; here we log a
 * generic export event). The CSV itself is returned in the response body — a
 * later increment can push it to storage / e-mail once a destination exists.
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

  try {
    const { csv, rows } = await buildExportCsv(admin, org.id as string, {});
    await admin.from("sync_log").insert({
      entity: "reporting_export",
      direction: "pg_to_airtable",
      status: "ok",
      detail: `export généré: ${rows} dossier(s)`,
    });
    return new Response("﻿" + csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="export-${slug}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "export failed";
    await logOpsEvent({ orgId: org.id as string, level: "error", source: "cron.export-bpf", message: "Échec de l'export BPF", detail: message });
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
