import Link from "next/link";
import { getOrgContext } from "@/lib/tenant";
import { listMyLearners } from "@/lib/data/coaching";
import { PageHeader, EmptyState } from "@/components/ui/page-header";
import { Table, THead, TBody, Tr, Th, Td } from "@/components/ui/table";

/** Coach portal home — the coach's own dossiers (RLS-scoped). */
export default async function CoachingPage() {
  const org = await getOrgContext();
  if (!org) return <p className="text-muted">Organisme introuvable.</p>;

  const learners = await listMyLearners(org.id);

  return (
    <div className="space-y-6">
      <PageHeader title="Mes apprenants" description={`${learners.length} dossier(s) que vous accompagnez.`} />

      {learners.length === 0 ? (
        <EmptyState title="Aucun apprenant" description="Aucun dossier ne vous est rattaché pour le moment." />
      ) : (
        <Table>
          <THead>
            <Tr>
              <Th>Apprenant</Th><Th>Programme</Th><Th>Statut</Th><Th>Avancement</Th><Th>Retard</Th>
            </Tr>
          </THead>
          <TBody>
            {learners.map((l) => (
              <Tr key={l.enrollmentId}>
                <Td className="font-medium">
                  <Link href={`/coaching/${l.enrollmentId}`}>{l.name}</Link>
                </Td>
                <Td>{l.program ?? "—"}</Td>
                <Td>{l.status ?? "—"}</Td>
                <Td>{l.progress != null ? `${Math.round(l.progress * 100)}%` : "—"}</Td>
                <Td className={(l.lateDays ?? 0) > 0 ? "font-medium text-error" : undefined}>
                  {l.lateDays != null ? `${l.lateDays} j` : "—"}
                </Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      )}
    </div>
  );
}
