import { getOrgContext } from "@/lib/tenant";
import { listPrograms } from "@/lib/data/programs";
import { PageHeader, EmptyState } from "@/components/ui/page-header";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, Tr, Th, Td } from "@/components/ui/table";
import { CreateProgramForm, PublishButton } from "./program-ui";

/** Module 4 / S4.1 — programme catalogue (direction/coordinator). */
export default async function ProgrammesPage() {
  const org = await getOrgContext();
  if (!org) return <p className="text-grey-600">Organisme introuvable.</p>;

  const programs = await listPrograms(org.id);

  return (
    <div className="space-y-6">
      <PageHeader title="Catalogue des programmes" description="Administrez les programmes et leur publication." />

      <Card>
        <CardTitle>Nouveau programme</CardTitle>
        <CreateProgramForm />
      </Card>

      {programs.length === 0 ? (
        <EmptyState title="Aucun programme" description="Créez votre premier programme ci-dessus." />
      ) : (
        <Table>
          <THead>
            <Tr>
              <Th>Nom</Th>
              <Th>Spécialité</Th>
              <Th>Famille</Th>
              <Th>CPF</Th>
              <Th>Statut</Th>
              <Th>Publication</Th>
            </Tr>
          </THead>
          <TBody>
            {programs.map((p) => (
              <Tr key={p.id}>
                <Td className="font-medium">{p.name}</Td>
                <Td>{p.specialty ?? "—"}</Td>
                <Td>{p.family ?? "—"}</Td>
                <Td>{p.cpf_eligible ? "Oui" : "Non"}</Td>
                <Td>
                  <Badge tone={p.published ? "success" : "warning"}>{p.published ? "Publié" : "Brouillon"}</Badge>
                </Td>
                <Td>
                  <PublishButton id={p.id} published={p.published} />
                </Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      )}
    </div>
  );
}
