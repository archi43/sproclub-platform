import Link from "next/link";
import { getOrgContext } from "@/lib/tenant";
import { getReport, type Dimension } from "@/lib/data/reporting";
import { DIMENSION_LABELS } from "@/lib/reporting-rules";
import type { Rate } from "@/lib/compliance-rules";
import { PageHeader, EmptyState } from "@/components/ui/page-header";
import { Button, buttonClasses } from "@/components/ui/button";
import { Select } from "@/components/ui/form";
import { Table, THead, TBody, Tr, Th, Td } from "@/components/ui/table";

function rateText(r: Rate | null, kind: "percent" | "raw" = "percent"): string {
  if (!r) return "—";
  const v = kind === "percent" ? `${Math.round(r.value * 100)} %` : r.value.toFixed(1);
  return `${v} (n=${r.n})`;
}

const DIMENSIONS: Dimension[] = ["program", "financer", "status"];

/** Module 5 / S5.1 — segmentable activity & results, with a dated CSV export.
 *  Direction/coordinator (staff layout). Each rate carries its effectif (CA-T5). */
export default async function ReportingPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const org = await getOrgContext();
  if (!org) return <p className="text-muted">Organisme introuvable.</p>;

  const pick = (k: string) => {
    const v = searchParams[k];
    return (Array.isArray(v) ? v[0] : v) || undefined;
  };
  const dimension = (DIMENSIONS.includes(pick("dim") as Dimension) ? pick("dim") : "program") as Dimension;
  const filters = { program: pick("program"), financer: pick("financer"), year: pick("year") };

  const report = await getReport(org.id, dimension, filters);

  const exportQuery = new URLSearchParams(
    Object.entries({ ...filters }).filter(([, v]) => !!v) as [string, string][]
  ).toString();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Indicateurs & reporting"
        description={`${report.total} dossier(s) — segmentés par ${DIMENSION_LABELS[dimension].toLowerCase()}.`}
        actions={
          <a
            href={`/coordination/reporting/export${exportQuery ? `?${exportQuery}` : ""}`}
            className={buttonClasses({ variant: "secondary" })}
          >
            Exporter (CSV)
          </a>
        }
      />

      <form method="get" className="flex flex-wrap items-end gap-2">
        <label className="text-sm">
          <span className="mb-1 block text-muted">Segmenter par</span>
          <Select name="dim" defaultValue={dimension} className="w-auto">
            {DIMENSIONS.map((d) => <option key={d} value={d}>{DIMENSION_LABELS[d]}</option>)}
          </Select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-muted">Programme</span>
          <Select name="program" defaultValue={filters.program ?? ""} className="w-auto">
            <option value="">Tous</option>
            {report.programs.map((p) => <option key={p} value={p}>{p}</option>)}
          </Select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-muted">Financeur</span>
          <Select name="financer" defaultValue={filters.financer ?? ""} className="w-auto">
            <option value="">Tous</option>
            {report.financers.map((f) => <option key={f} value={f}>{f}</option>)}
          </Select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-muted">Année</span>
          <Select name="year" defaultValue={filters.year ?? ""} className="w-auto">
            <option value="">Toutes</option>
            {report.years.map((y) => <option key={y} value={y}>{y}</option>)}
          </Select>
        </label>
        <Button type="submit" size="sm">Filtrer</Button>
        <Link href="/coordination/reporting" className="text-sm text-muted no-underline hover:underline">Réinitialiser</Link>
      </form>

      {report.segments.length === 0 ? (
        <EmptyState title="Aucune donnée" description="Aucun dossier ne correspond à ces filtres." />
      ) : (
        <Table>
          <THead>
            <Tr>
              <Th>{DIMENSION_LABELS[dimension]}</Th>
              <Th>Effectif</Th><Th>Actifs</Th><Th>Terminés</Th>
              <Th>Réussite cert.</Th><Th>Insertion</Th><Th>Satisfaction</Th>
            </Tr>
          </THead>
          <TBody>
            {report.segments.map((s) => (
              <Tr key={s.key}>
                <Td className="font-medium">{s.key}</Td>
                <Td>{s.kpis.total}</Td>
                <Td>{s.kpis.active}</Td>
                <Td>{s.kpis.finished}</Td>
                <Td>{rateText(s.kpis.certification)}</Td>
                <Td>{rateText(s.kpis.insertion)}</Td>
                <Td>{rateText(s.kpis.satisfaction, "raw")}</Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      )}
    </div>
  );
}
