import Link from "next/link";
import { getOrgContext } from "@/lib/tenant";
import { StatTile, StatGrid } from "@/components/ui/stat";
import { directionDashboard, compliancePrograms, type Rate } from "@/lib/data/compliance";
import { COMPLIANCE_SCOPE_START } from "@/lib/compliance-rules";
import { PageHeader, EmptyState } from "@/components/ui/page-header";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/form";
import { FilterBar, FilterField } from "@/components/ui/filter-bar";
import { Alert } from "@/components/ui/alert";
import { Table, THead, TBody, Tr, Th, Td } from "@/components/ui/table";

/**
 * Un taux se lit en deux temps : la valeur, puis l'effectif sur lequel elle est
 * calculée (CA-T5). Les coller dans la même ligne (« 100 % (n=30) ») faisait
 * passer le chiffre sur deux lignes et cassait l'alignement de la bande ;
 * l'effectif appartient au `hint` de la tuile, pas à sa valeur.
 */
function rateValue(r: Rate | null, kind: "percent" | "raw" = "percent"): string {
  if (!r) return "—";
  return kind === "percent" ? `${Math.round(r.value * 100)} %` : r.value.toFixed(1);
}

/** Effectif du taux, ou `undefined` quand il n'y a rien à dire. */
function rateHint(r: Rate | null, total: number): string | undefined {
  if (!r) return "donnée non renseignée";
  const part = total > 0 ? ` sur ${total} terminés` : "";
  return `calculé sur ${r.n} dossier${r.n > 1 ? "s" : ""}${part}`;
}

/** Module 0 / S0.1 — direction dashboard: alerts first, then results with their
 *  effectif, then the caseload split. Direction/coordinator (staff layout). */
export default async function PilotagePage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const org = await getOrgContext();
  if (!org) return <p className="text-muted">Organisme introuvable.</p>;

  const raw = searchParams.program;
  const program = (Array.isArray(raw) ? raw[0] : raw) || undefined;

  const [{ kpis, nonConforming }, programs] = await Promise.all([
    directionDashboard(org.id, { program }),
    compliancePrograms(org.id),
  ]);

  // Phrase construite hors du JSX : une expression en début de ligne suivie de
  // texte perd son espace au rendu avec Turbopack.
  const scopeDate = new Date(COMPLIANCE_SCOPE_START);
  // « 1er », pas « 1 » : `toLocaleDateString` ne connaît pas l'ordinal français.
  const scopeDay = scopeDate.getUTCDate() === 1 ? "1er" : String(scopeDate.getUTCDate());
  const scopeMonth = scopeDate.toLocaleDateString("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" });
  const scopeStart = `${scopeDay} ${scopeMonth}`;
  const scopeNote = `La complétude est contrôlée sur les dossiers dont l'entrée en formation est postérieure au ${scopeStart}. Les parcours antérieurs restent consultables dans Conformité, sans alerte.`;

  return (
    <div className="space-y-6">
      <PageHeader title="Pilotage" description="État de santé pédagogique : alertes, résultats et activité." />

      <FilterBar resetHref="/coordination/pilotage" active={!!program}>
        <FilterField label="Programme">
          <Select name="program" defaultValue={program ?? ""}>
            <option value="">Tous</option>
            {programs.map((p) => <option key={p} value={p}>{p}</option>)}
          </Select>
        </FilterField>
      </FilterBar>

      {/* Alertes en tête */}
      {kpis.nonConforming > 0 && (
        <Alert tone="error">
          {kpis.nonConforming} dossier(s) terminé(s) non conforme(s) : pièces obligatoires manquantes.
        </Alert>
      )}

      {/* Deux natures de chiffres, deux bandes. Mélangées, aucune ne ressortait :
          un volume de dossiers et un taux de réussite ne se lisent pas de la
          même façon et n'appellent pas la même décision. */}
      <section className="space-y-3">
        <h2 className="text-label font-medium uppercase text-muted">Activité</h2>
        <StatGrid>
          <Kpi label="Apprenants actifs" value={String(kpis.active)} hint="en cours ou prêts à débuter" />
          <Kpi label="Terminés" value={String(kpis.finished)} />
          <Kpi label="En pause" value={String(kpis.paused)} />
          <Kpi
            label="Non conformes"
            value={String(kpis.nonConforming)}
            // L'effectif cité est celui des dossiers CONTRÔLÉS, pas des dossiers
            // terminés : la règle ne couvre que les entrées depuis le seuil, et
            // citer les 405 terminés laisserait croire qu'ils l'ont tous été.
            hint={
              kpis.inScope > 0
                ? `sur ${kpis.inScope} dossier${kpis.inScope > 1 ? "s" : ""} contrôlé${kpis.inScope > 1 ? "s" : ""}`
                : "aucun dossier encore contrôlé"
            }
            tone={kpis.nonConforming > 0 ? "error" : undefined}
          />
        </StatGrid>
      </section>

      <section className="space-y-3">
        <h2 className="text-label font-medium uppercase text-muted">Résultats</h2>
        <StatGrid>
          <Kpi label="Réussite certification" value={rateValue(kpis.certification)} hint={rateHint(kpis.certification, kpis.finished)} />
          <Kpi label="Insertion (en poste)" value={rateValue(kpis.insertion)} hint={rateHint(kpis.insertion, kpis.finished)} />
          <Kpi label="Satisfaction moyenne" value={rateValue(kpis.satisfaction, "raw")} hint={rateHint(kpis.satisfaction, kpis.finished)} />
          <Kpi label="NPS moyen" value={rateValue(kpis.nps, "raw")} hint={rateHint(kpis.nps, kpis.finished)} />
        </StatGrid>
      </section>

      {/* Dossiers à risque (liste cliquable) */}
      <Card>
        <CardTitle>Dossiers terminés non conformes</CardTitle>
        <p className="mb-3 text-sm text-muted">{scopeNote}</p>
        {nonConforming.length === 0 ? (
          <EmptyState
            title="Aucun dossier à risque"
            description={
              kpis.inScope > 0
                ? "Les dossiers contrôlés réunissent toutes leurs pièces."
                : "Aucun dossier du périmètre n'est encore arrivé à son terme : le contrôle s'exercera à mesure que ces parcours se termineront."
            }
          />
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
                  <Td className="text-sm text-muted">
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

/** Tuile de résultat : la primitive `StatTile`, jamais une tuile recodée ici. */
function Kpi({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "error" }) {
  return <StatTile label={label} value={value} hint={hint} tone={tone === "error" ? "critical" : "neutral"} />;
}
