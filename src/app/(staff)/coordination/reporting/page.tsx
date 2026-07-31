import { getOrgContext } from "@/lib/tenant";
import { getReport, type Dimension } from "@/lib/data/reporting";
import { DIMENSION_LABELS } from "@/lib/reporting-rules";
import type { Rate } from "@/lib/compliance-rules";
import { PageHeader, EmptyState } from "@/components/ui/page-header";
import { buttonClasses } from "@/components/ui/button";
import { Select } from "@/components/ui/form";
import { FilterBar, FilterField } from "@/components/ui/filter-bar";
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
  // La dimension a une valeur par défaut : elle ne compte comme filtre que si elle en diffère.
  const hasFilter = Object.values(filters).some(Boolean) || dimension !== "program";

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

      <FilterBar resetHref="/coordination/reporting" active={hasFilter}>
        <FilterField label="Segmenter par">
          <Select name="dim" defaultValue={dimension}>
            {DIMENSIONS.map((d) => <option key={d} value={d}>{DIMENSION_LABELS[d]}</option>)}
          </Select>
        </FilterField>
        <FilterField label="Programme">
          <Select name="program" defaultValue={filters.program ?? ""}>
            <option value="">Tous</option>
            {report.programs.map((p) => <option key={p} value={p}>{p}</option>)}
          </Select>
        </FilterField>
        <FilterField label="Financeur">
          <Select name="financer" defaultValue={filters.financer ?? ""}>
            <option value="">Tous</option>
            {report.financers.map((f) => <option key={f} value={f}>{f}</option>)}
          </Select>
        </FilterField>
        <FilterField label="Année">
          <Select name="year" defaultValue={filters.year ?? ""}>
            <option value="">Toutes</option>
            {report.years.map((y) => <option key={y} value={y}>{y}</option>)}
          </Select>
        </FilterField>
      </FilterBar>

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
