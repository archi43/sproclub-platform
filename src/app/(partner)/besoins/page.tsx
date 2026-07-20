import { getOrgContext } from "@/lib/tenant";
import { listMyTrainingNeeds, type TrainingNeedStatus } from "@/lib/data/jobs";
import { PageHeader, EmptyState } from "@/components/ui/page-header";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, Tr, Th, Td } from "@/components/ui/table";
import { TrainingNeedForm } from "./need-form";

const NEED_STATUS: Record<TrainingNeedStatus, { label: string; tone: "success" | "warning" | "neutral" }> = {
  open: { label: "Transmis", tone: "warning" },
  reviewed: { label: "Pris en compte", tone: "success" },
  closed: { label: "Clôturé", tone: "neutral" },
};

/**
 * Portail partenaire — besoins de formation (INC-18).
 * L'entreprise exprime les compétences qu'elle aimerait voir formées ; ce signal
 * remonte à l'équipe pédagogique SproCLUB (jamais visible des apprenants).
 */
export default async function BesoinsPage() {
  const org = await getOrgContext();
  if (!org) return <p className="text-muted">Organisme introuvable.</p>;

  const needs = await listMyTrainingNeeds(org.id);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Besoins de formation"
        description="Exprimez les compétences et profils dont votre entreprise a besoin. Nos équipes s'en servent pour orienter les formations et anticiper les promotions."
      />

      <Card>
        <CardTitle>Exprimer un besoin</CardTitle>
        <TrainingNeedForm />
      </Card>

      {needs.length === 0 ? (
        <EmptyState title="Aucun besoin exprimé" description="Partagez votre premier besoin ci-dessus." />
      ) : (
        <Card className="p-0">
          <Table>
            <THead>
              <Tr>
                <Th>Compétence / domaine</Th>
                <Th>Profils</Th>
                <Th>Échéance</Th>
                <Th>Statut</Th>
                <Th>Transmis le</Th>
              </Tr>
            </THead>
            <TBody>
              {needs.map((n) => (
                <Tr key={n.id}>
                  <Td className="font-medium text-ink">
                    {n.title}
                    {n.description && <span className="block text-xs text-muted">{n.description}</span>}
                  </Td>
                  <Td>{n.headcount ?? "—"}</Td>
                  <Td>{n.timeframe ?? "—"}</Td>
                  <Td><Badge tone={NEED_STATUS[n.status].tone}>{NEED_STATUS[n.status].label}</Badge></Td>
                  <Td className="text-sm text-muted">{new Date(n.createdAt).toLocaleDateString("fr-FR")}</Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
