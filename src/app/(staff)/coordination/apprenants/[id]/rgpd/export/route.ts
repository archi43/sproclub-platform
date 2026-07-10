import { getOrgContext } from "@/lib/tenant";
import { getCurrentUser, getRolesForOrg } from "@/lib/auth";
import { exportPersonalData, logDossierAccess } from "@/lib/data/rgpd";

/**
 * RGPD personal-data export (INC-11). Direction/coordinator only; the access is
 * itself audited. Reads through the RLS client, so the export is bounded to the
 * caller's org.
 */
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const org = await getOrgContext();
  if (!org) return new Response("Organisme introuvable.", { status: 404 });
  const user = await getCurrentUser();
  if (!user) return new Response("Non authentifié.", { status: 401 });
  const roles = await getRolesForOrg(org.id);
  if (!roles.includes("direction") && !roles.includes("coordinator")) {
    return new Response("Accès refusé.", { status: 403 });
  }

  const data = await exportPersonalData(org.id, params.id);
  if (!data) return new Response("Apprenant introuvable.", { status: 404 });

  await logDossierAccess("dossier.export", params.id, "Export des données personnelles");

  const date = new Date().toISOString().slice(0, 10);
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="rgpd-${params.id}-${date}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
