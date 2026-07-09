import Link from "next/link";
import { getOrgContext } from "@/lib/tenant";
import { listDossierCompleteness, compliancePrograms } from "@/lib/data/compliance";
import { PageHeader, EmptyState } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/form";
import { Table, THead, TBody, Tr, Th, Td } from "@/components/ui/table";

/** Module 3 / S3.1 — dossier completeness grid. One row per dossier, a column
 *  per obligatory piece (present/absent), the completeness rate, and finished
 *  non-conforming dossiers flagged in red. Direction/coordinator (staff layout). */
export default async function ConformitePage({
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
  const program = pick("program");
  const cpfOnly = pick("cpf") === "1";

  const [rows, programs] = await Promise.all([
    listDossierCompleteness(org.id, { program, cpfOnly }),
    compliancePrograms(org.id),
  ]);

  // Column headers = the piece labels of the first row (stable set).
  const pieceLabels = rows[0]?.pieces.map((p) => p.label) ?? [
    "Attestation d'entrée", "Convention", "Comptes rendus", "Note de soutenance", "Certification", "Insertion", "Questionnaire",
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Conformité des dossiers" description="Complétude des pièces obligatoires (S3.1)." />

      <form method="get" className="flex flex-wrap items-center gap-2">
        <Select name="program" defaultValue={program ?? ""} aria-label="Programme" className="w-auto">
          <option value="">Tous les programmes</option>
          {programs.map((p) => <option key={p} value={p}>{p}</option>)}
        </Select>
        <label className="flex items-center gap-2 text-sm text-grey-600">
          <input type="checkbox" name="cpf" value="1" defaultChecked={cpfOnly} className="accent-brand" /> CPF uniquement
        </label>
        <Button type="submit" size="sm">Filtrer</Button>
        {(program || cpfOnly) && <Link href="/coordination/conformite" className="text-sm text-grey-600 no-underline hover:underline">Réinitialiser</Link>}
      </form>

      {rows.length === 0 ? (
        <EmptyState title="Aucun dossier" description="Aucun dossier ne correspond à ces filtres." />
      ) : (
        <Table>
          <THead>
            <Tr>
              <Th>Apprenant</Th>
              <Th>Statut</Th>
              {pieceLabels.map((l) => <Th key={l} className="text-center">{l}</Th>)}
              <Th>Complétude</Th>
            </Tr>
          </THead>
          <TBody>
            {rows.map((d) => (
              <Tr key={d.enrollmentId} className={d.nonConforming ? "bg-error/5" : undefined}>
                <Td className="font-medium">
                  <Link href={`/coordination/apprenants/${d.learnerId}`}>{d.learnerName}</Link>
                  {d.program && <div className="text-xs text-grey-600">{d.program}</div>}
                </Td>
                <Td>{d.status ?? "—"}</Td>
                {d.pieces.map((p) => (
                  <Td key={p.key} className="text-center">
                    <span aria-label={p.present ? `${p.label} présent` : `${p.label} manquant`} className={p.present ? "font-semibold text-success" : "font-semibold text-warning"}>
                      {p.present ? "✓" : "✗"}
                    </span>
                  </Td>
                ))}
                <Td>
                  <Badge tone={d.nonConforming ? "danger" : d.score === 1 ? "success" : "warning"}>
                    {Math.round(d.score * 100)} %
                  </Badge>
                </Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      )}
    </div>
  );
}
