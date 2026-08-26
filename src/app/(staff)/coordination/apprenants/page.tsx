import Link from "next/link";
import { getOrgContext } from "@/lib/tenant";
import { listDossiers, dossierFilterOptions, type DossierFilters } from "@/lib/data/admin-learners";
import { PageHeader, EmptyState } from "@/components/ui/page-header";
import { StatTile, StatGrid } from "@/components/ui/stat";
import { summarizeDossiers } from "@/lib/list-summary-rules";
import { progressPercent } from "@/lib/journey-rules";
import { Select } from "@/components/ui/form";
import { FilterBar, FilterField, FilterCheckbox, FilterSearch } from "@/components/ui/filter-bar";
import { Table, THead, TBody, Tr, Th, Td } from "@/components/ui/table";

/** Module 2 / S2.1 — filterable list of dossiers (direction/coordinator; a coach
 *  sees only their own via RLS). One row = one dossier. */
export default async function ApprenantsPage({
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
  const filters: DossierFilters = {
    search: pick("q"),
    program: pick("program"),
    specialty: pick("specialty"),
    status: pick("status"),
    financer: pick("financer"),
    late: pick("late") === "1",
  };
  const hasFilter = Object.values(filters).some(Boolean);

  const [rows, options] = await Promise.all([listDossiers(org.id, filters), dossierFilterOptions(org.id)]);

  // Les tuiles décrivent la sélection affichée, pas tout l'organisme — le
  // libellé le dit, sinon on les lirait comme un indicateur de pilotage.
  const summary = summarizeDossiers(
    rows.map((r) => ({ status: r.status, lateDays: r.lateDays, percent: progressPercent(r.progress) }))
  );

  return (
    <div>
      <PageHeader
        eyebrow="Coordination · Module 2"
        title="Apprenants"
        description={hasFilter ? `${summary.shown} dossier(s) correspondant aux filtres` : `${summary.shown} dossier(s)`}
      />

      <StatGrid className="mb-6">
        <StatTile label="Dossiers affichés" value={summary.shown} />
        <StatTile
          label="En retard"
          value={summary.late}
          tone={summary.late > 0 ? "critical" : "neutral"}
        />
        <StatTile label="Terminés" value={summary.finished} />
        <StatTile
          label="Avancement moyen"
          value={summary.averageProgress != null ? `${summary.averageProgress} %` : "—"}
          hint={summary.averageProgress == null ? "Aucun avancement renseigné" : undefined}
        />
      </StatGrid>

      <FilterBar resetHref="/coordination/apprenants" active={hasFilter} className="mb-6">
        <FilterSearch defaultValue={filters.search} placeholder="Nom ou e-mail…" />
        <FilterField label="Programme">
          <Select name="program" defaultValue={filters.program ?? ""}>
            <option value="">Tous</option>
            {options.programs.map((p) => <option key={p} value={p}>{p}</option>)}
          </Select>
        </FilterField>
        <FilterField label="Spécialité">
          <Select name="specialty" defaultValue={filters.specialty ?? ""}>
            <option value="">Toutes</option>
            {options.specialties.map((s) => <option key={s} value={s}>{s}</option>)}
          </Select>
        </FilterField>
        <FilterField label="Statut">
          <Select name="status" defaultValue={filters.status ?? ""}>
            <option value="">Tous</option>
            {options.statuses.map((s) => <option key={s} value={s}>{s}</option>)}
          </Select>
        </FilterField>
        <FilterField label="Financeur">
          <Select name="financer" defaultValue={filters.financer ?? ""}>
            <option value="">Tous</option>
            {options.financers.map((f) => <option key={f} value={f}>{f}</option>)}
          </Select>
        </FilterField>
        <FilterCheckbox name="late" label="En retard" defaultChecked={filters.late} />
      </FilterBar>

      {rows.length === 0 ? (
        <EmptyState title="Aucun dossier" description="Aucun dossier ne correspond à ces filtres." />
      ) : (
        <Table>
          <THead>
            <Tr>
              <Th>Apprenant</Th>
              <Th>Programme</Th>
              <Th>Financeur</Th>
              <Th>Statut</Th>
              <Th numeric>Avancement</Th>
              <Th numeric>Retard</Th>
            </Tr>
          </THead>
          <TBody>
            {rows.map((r) => (
              <Tr key={r.enrollmentId}>
                <Td>
                  <Link href={`/coordination/apprenants/${r.learnerId}`}>
                    {[r.firstName, r.lastName].filter(Boolean).join(" ") || r.email}
                  </Link>
                </Td>
                <Td>{r.program ?? "—"}</Td>
                <Td>{r.financer ?? "—"}</Td>
                <Td>{r.status ?? "—"}</Td>
                <Td numeric>{r.progress != null ? `${progressPercent(r.progress)} %` : "—"}</Td>
                <Td numeric className={(r.lateDays ?? 0) > 0 ? "font-medium text-error" : undefined}>
                  {r.lateDays != null ? `${r.lateDays} j` : "—"}
                </Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      )}
    </div>
  );
}
