import { getOrgContext } from "@/lib/tenant";
import { listAllOffers, listAllTrainingNeeds, type TrainingNeedStatus } from "@/lib/data/jobs";
import { JOB_STATUS_LABELS, type JobStatus } from "@/lib/job-rules";
import { PageHeader, EmptyState } from "@/components/ui/page-header";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, Tr, Th, Td } from "@/components/ui/table";
import { OfferModeration, NeedReview } from "./moderation-ui";

const OFFER_TONE: Record<JobStatus, "success" | "warning" | "neutral"> = {
  published: "success", pending: "warning", rejected: "warning", archived: "neutral",
};
const NEED_LABEL: Record<TrainingNeedStatus, string> = { open: "Transmis", reviewed: "Pris en compte", closed: "Clôturé" };

/**
 * Coordination — recrutement (INC-18) : modération des offres des entreprises
 * partenaires (validation avant visibilité apprenants) et suivi des besoins de
 * formation exprimés (signal pour l'ingénierie pédagogique).
 */
export default async function RecrutementPage() {
  const org = await getOrgContext();
  if (!org) return <p className="text-muted">Organisme introuvable.</p>;

  const [offers, needs] = await Promise.all([listAllOffers(org.id), listAllTrainingNeeds(org.id)]);
  const pending = offers.filter((o) => o.status === "pending");
  const others = offers.filter((o) => o.status !== "pending");

  return (
    <div className="space-y-10">
      <div className="space-y-6">
        <PageHeader
          title="Modération des offres"
          description="Validez les offres des entreprises partenaires avant qu'elles soient visibles des apprenants."
        />
        {pending.length > 0 && (
          <Card>
            <CardTitle>À valider ({pending.length})</CardTitle>
            <Table>
              <THead><Tr><Th>Entreprise / poste</Th><Th>Contrat</Th><Th>Action</Th></Tr></THead>
              <TBody>
                {pending.map((o) => (
                  <Tr key={o.id}>
                    <Td>
                      <span className="font-medium text-ink">{o.title}</span>
                      <span className="block text-xs text-muted">{o.companyName ?? "—"}</span>
                      <span className="mt-1 block max-w-xl whitespace-pre-wrap text-sm text-muted">{o.description}</span>
                    </Td>
                    <Td>{o.contractType ?? "—"}</Td>
                    <Td><OfferModeration offerId={o.id} status={o.status} /></Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          </Card>
        )}
        {others.length === 0 && pending.length === 0 ? (
          <EmptyState title="Aucune offre" description="Les offres soumises par les entreprises apparaîtront ici." />
        ) : (
          <Card className="p-0">
            <div className="p-4"><CardTitle>Toutes les offres</CardTitle></div>
            <Table>
              <THead><Tr><Th>Poste</Th><Th>Entreprise</Th><Th>Statut</Th><Th>Intéressés</Th><Th>Action</Th></Tr></THead>
              <TBody>
                {offers.map((o) => (
                  <Tr key={o.id}>
                    <Td className="font-medium text-ink">{o.title}</Td>
                    <Td>{o.companyName ?? "—"}</Td>
                    <Td><Badge tone={OFFER_TONE[o.status]}>{JOB_STATUS_LABELS[o.status]}</Badge></Td>
                    <Td>{o.interestCount}</Td>
                    <Td><OfferModeration offerId={o.id} status={o.status} /></Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          </Card>
        )}
      </div>

      <div className="space-y-6">
        <PageHeader
          title="Besoins de formation des entreprises"
          description="Signal de demande exprimé par les partenaires — à exploiter pour orienter les programmes et anticiper les promotions."
        />
        {needs.length === 0 ? (
          <EmptyState title="Aucun besoin exprimé" description="Les besoins des entreprises partenaires apparaîtront ici." />
        ) : (
          <Card className="p-0">
            <Table>
              <THead><Tr><Th>Compétence / domaine</Th><Th>Entreprise</Th><Th>Profils</Th><Th>Échéance</Th><Th>Suivi</Th></Tr></THead>
              <TBody>
                {needs.map((n) => (
                  <Tr key={n.id}>
                    <Td>
                      <span className="font-medium text-ink">{n.title}</span>
                      {n.description && <span className="block max-w-md text-xs text-muted">{n.description}</span>}
                    </Td>
                    <Td>{n.companyName ?? "—"}</Td>
                    <Td>{n.headcount ?? "—"}</Td>
                    <Td>{n.timeframe ?? "—"}</Td>
                    <Td>
                      <span className="mb-1 block text-xs text-muted">{NEED_LABEL[n.status]}</span>
                      <NeedReview needId={n.id} status={n.status} />
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          </Card>
        )}
      </div>
    </div>
  );
}
