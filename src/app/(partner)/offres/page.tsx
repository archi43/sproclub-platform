import Link from "next/link";
import { getOrgContext } from "@/lib/tenant";
import { listMyCompanyOffers } from "@/lib/data/jobs";
import { JOB_STATUS_LABELS, type JobStatus } from "@/lib/job-rules";
import { PageHeader, EmptyState } from "@/components/ui/page-header";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, Tr, Th, Td } from "@/components/ui/table";
import { CreateOfferForm, OfferTransitionButton } from "./offer-forms";

const STATUS_TONE: Record<JobStatus, "success" | "warning" | "neutral"> = {
  published: "success",
  pending: "warning",
  rejected: "warning",
  archived: "neutral",
};

/**
 * Portail partenaire — mes offres d'emploi (INC-18).
 * L'entreprise publie des offres (modérées par la coordination avant d'être
 * visibles des apprenants) et suit les candidats intéressés.
 */
export default async function MesOffresPage() {
  const org = await getOrgContext();
  if (!org) return <p className="text-muted">Organisme introuvable.</p>;

  const offers = await listMyCompanyOffers(org.id);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Mes offres d'emploi"
        description="Publiez vos offres à destination des apprenants. Chaque offre est validée par la coordination avant d'être visible."
      />

      <Card>
        <CardTitle>Nouvelle offre</CardTitle>
        <CreateOfferForm />
      </Card>

      {offers.length === 0 ? (
        <EmptyState title="Aucune offre" description="Créez votre première offre ci-dessus." />
      ) : (
        <Card className="p-0">
          <Table>
            <THead>
              <Tr>
                <Th>Poste</Th>
                <Th>Contrat</Th>
                <Th>Statut</Th>
                <Th>Intéressés</Th>
                <Th>Actions</Th>
              </Tr>
            </THead>
            <TBody>
              {offers.map((o) => (
                <Tr key={o.id}>
                  <Td className="font-medium text-ink">
                    <Link href={`/offres/${o.id}`} className="text-brand hover:underline">{o.title}</Link>
                    {o.location && <span className="block text-xs text-muted">{o.location}{o.remote ? ` · ${o.remote}` : ""}</span>}
                    {o.status === "rejected" && o.moderationNote && (
                      <span className="block text-xs text-error">Motif : {o.moderationNote}</span>
                    )}
                  </Td>
                  <Td>{o.contractType ?? "—"}</Td>
                  <Td><Badge tone={STATUS_TONE[o.status]}>{JOB_STATUS_LABELS[o.status]}</Badge></Td>
                  <Td>
                    {o.status === "published" ? (
                      <Link href={`/offres/${o.id}`} className="text-brand hover:underline">{o.interestCount} candidat(s)</Link>
                    ) : (
                      "—"
                    )}
                  </Td>
                  <Td>
                    <div className="flex flex-wrap gap-2">
                      {o.status === "rejected" && <OfferTransitionButton offerId={o.id} status="pending" label="Re-soumettre" variant="secondary" />}
                      {o.status !== "archived" && <OfferTransitionButton offerId={o.id} status="archived" label="Archiver" />}
                    </div>
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
