import { type NextRequest } from "next/server";
import { getOrgContext } from "@/lib/tenant";
import { getCurrentUser, getRolesForOrg } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { buildExportCsv } from "@/lib/data/reporting";

/**
 * Dated regulatory CSV export (Module 5). Guarded like the reporting screen:
 * direction/coordinator only, and the RLS server client is used so the export
 * never contains rows the caller can't already see. A UTF-8 BOM is prepended so
 * spreadsheets open accented text correctly.
 */
export async function GET(request: NextRequest) {
  const org = await getOrgContext();
  if (!org) return new Response("Organisme introuvable.", { status: 404 });

  const user = await getCurrentUser();
  if (!user) return new Response("Non authentifié.", { status: 401 });

  const roles = await getRolesForOrg(org.id);
  if (!roles.includes("direction") && !roles.includes("coordinator")) {
    return new Response("Accès refusé.", { status: 403 });
  }

  const sp = request.nextUrl.searchParams;
  const filters = {
    program: sp.get("program") || undefined,
    financer: sp.get("financer") || undefined,
    year: sp.get("year") || undefined,
  };

  const { csv, rows } = await buildExportCsv(createClient(), org.id, filters);

  // Audit the access to nominative dossiers (who / when / scope), consistent
  // with the periodic cron. Uses the service-role client (RLS-restricted
  // observability table); the human authorization was already checked above.
  await adminClient().from("sync_log").insert({
    entity: "reporting_export",
    direction: "pg_to_airtable",
    status: "ok",
    record_ref: user.id,
    detail: `export interactif par ${user.email ?? user.id} — ${rows} dossier(s) — filtres ${JSON.stringify(filters)}`,
  });

  const date = new Date().toISOString().slice(0, 10);
  const filename = `export-${org.slug}-${date}.csv`;

  return new Response("﻿" + csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
