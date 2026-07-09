import Link from "next/link";
import { getOrgContext } from "@/lib/tenant";
import { listDossiers, dossierFilterOptions, type DossierFilters } from "@/lib/data/admin-learners";
import { PageHeader, EmptyState } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/form";
import { Table, THead, TBody, Tr, Th, Td } from "@/components/ui/table";

/** Module 2 / S2.1 — filterable list of dossiers (direction/coordinator; a coach
 *  sees only their own via RLS). One row = one dossier. */
export default async function ApprenantsPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const org = await getOrgContext();
  if (!org) return <p className="text-grey-600">Organisme introuvable.</p>;

  const pick = (k: string) => {
    const v = searchParams[k];
    return (Array.isArray(v) ? v[0] : v) || undefined;
  };
  const filters: DossierFilters = {
    program: pick("program"),
    status: pick("status"),
    financer: pick("financer"),
    late: pick("late") === "1",
  };

  const [rows, options] = await Promise.all([listDossiers(org.id, filters), dossierFilterOptions(org.id)]);

  return (
    <div>
      <PageHeader title="Apprenants" description={`${rows.length} dossier(s)`} />

      <form method="get" className="mb-5 flex flex-wrap items-center gap-2">
        <Select name="program" defaultValue={filters.program ?? ""} aria-label="Programme" className="w-auto">
          <option value="">Tous les programmes</option>
          {options.programs.map((p) => <option key={p} value={p}>{p}</option>)}
        </Select>
        <Select name="status" defaultValue={filters.status ?? ""} aria-label="Statut" className="w-auto">
          <option value="">Tous les statuts</option>
          {options.statuses.map((s) => <option key={s} value={s}>{s}</option>)}
        </Select>
        <Select name="financer" defaultValue={filters.financer ?? ""} aria-label="Financeur" className="w-auto">
          <option value="">Tous les financeurs</option>
          {options.financers.map((f) => <option key={f} value={f}>{f}</option>)}
        </Select>
        <label className="flex items-center gap-2 text-sm text-grey-600">
          <input type="checkbox" name="late" value="1" defaultChecked={filters.late} className="accent-brand" /> En retard
        </label>
        <Button type="submit" size="sm">Filtrer</Button>
        <Link href="/coordination/apprenants" className="text-sm text-grey-600 no-underline hover:underline">
          Réinitialiser
        </Link>
      </form>

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
              <Th>Avancement</Th>
              <Th>Retard</Th>
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
                <Td>{r.progress != null ? `${Math.round(r.progress * 100)}%` : "—"}</Td>
                <Td className={(r.lateDays ?? 0) > 0 ? "font-medium text-error" : undefined}>
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
