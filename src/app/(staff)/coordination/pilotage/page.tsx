import Link from "next/link";
import { getOrgContext } from "@/lib/tenant";
import { directionDashboard, compliancePrograms, type Rate } from "@/lib/data/compliance";
import { PageHeader, EmptyState } from "@/components/ui/page-header";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/form";
import { Alert } from "@/components/ui/alert";
import { Table, THead, TBody, Tr, Th, Td } from "@/components/ui/table";

/** A rate is shown with its effectif; hidden entirely when n = 0 (CA-T5). */
function rateText(r: Rate | null, kind: "percent" | "raw" = "percent"): string {
  if (!r) return "—";
  const v = kind === "percent" ? `${Math.round(r.value * 100)} %` : r.value.toFixed(1);
  return `${v} (n=${r.n})`;
}

/** Module 0 / S0.1 — direction dashboard: alerts first, then results with their
 *  effectif, then the caseload split. Direction/coordinator (staff layout). */
export default async function PilotagePage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const org = await getOrgContext();
  if (!org) return <p className="text-grey-600">Organisme introuvable.</p>;

  const raw = searchParams.program;
  const program = (Array.isArray(raw) ? raw[0] : raw) || undefined;

  const [{ kpis, nonConforming }, programs] = await Promise.all([
    directionDashboard(org.id, { program }),
    compliancePrograms(org.id),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader title="Pilotage" description="État de santé pédagogique : alertes, résultats et activité." />

      <form method="get" className="flex flex-wrap items-center gap-2">
        <Select name="program" defaultValue={program ?? ""} aria-label="Programme" className="w-auto">
          <option value="">Tous les programmes</option>
          {programs.map((p) => <option key={p} value={p}>{p}</option>)}
        </Select>
        <Button type="submit" size="sm">Filtrer</Button>
        {program && <Link href="/coordination/pilotage" className="text-sm text-grey-600 no-underline hover:underline">Réinitialiser</Link>}
      </form>

      {/* Alertes en tête */}
      {kpis.nonConforming > 0 && (
        <Alert tone="error">
          {kpis.nonConforming} dossier(s) terminé(s) non conforme(s) — pièces obligatoires manquantes.
        </Alert>
      )}

      {/* Résultats (chaque taux avec son effectif, masqué si n=0) */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Apprenants actifs" value={String(kpis.active)} />
        <Kpi label="Terminés" value={String(kpis.finished)} />
        <Kpi label="En pause" value={String(kpis.paused)} />
        <Kpi label="Non conformes" value={String(kpis.nonConforming)} tone={kpis.nonConforming > 0 ? "error" : undefined} />
        <Kpi label="Réussite certification" value={rateText(kpis.certification)} />
        <Kpi label="Insertion (en poste)" value={rateText(kpis.insertion)} />
        <Kpi label="Satisfaction moyenne" value={rateText(kpis.satisfaction, "raw")} />
        <Kpi label="NPS moyen" value={rateText(kpis.nps, "raw")} />
      </div>

      {/* Dossiers à risque (liste cliquable) */}
      <Card>
        <CardTitle>Dossiers terminés non conformes</CardTitle>
        {nonConforming.length === 0 ? (
          <EmptyState title="Aucun dossier à risque" description="Tous les dossiers terminés réunissent leurs pièces." />
        ) : (
          <Table>
            <THead>
              <Tr><Th>Apprenant</Th><Th>Programme</Th><Th>Complétude</Th><Th>Pièces manquantes</Th></Tr>
            </THead>
            <TBody>
              {nonConforming.map((d) => (
                <Tr key={d.enrollmentId}>
                  <Td className="font-medium">
                    <Link href={`/coordination/apprenants/${d.learnerId}`}>{d.learnerName}</Link>
                  </Td>
                  <Td>{d.program ?? "—"}</Td>
                  <Td><Badge tone="danger">{Math.round(d.score * 100)} %</Badge></Td>
                  <Td className="text-sm text-grey-600">
                    {d.pieces.filter((p) => !p.present).map((p) => p.label).join(", ")}
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: "error" }) {
  return (
    <Card>
      <div className="text-xs text-grey-600">{label}</div>
      <div className={`mt-1 text-xl font-semibold ${tone === "error" ? "text-error" : "text-brand"}`}>{value}</div>
    </Card>
  );
}
