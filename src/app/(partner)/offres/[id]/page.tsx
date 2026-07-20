import Link from "next/link";
import { getOrgContext } from "@/lib/tenant";
import { listMyCompanyOffers, listOfferCandidates } from "@/lib/data/jobs";
import { JOB_STATUS_LABELS } from "@/lib/job-rules";
import { PageHeader, EmptyState } from "@/components/ui/page-header";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, Tr, Th, Td } from "@/components/ui/table";

/**
 * Portail partenaire — détail d'une offre + candidats intéressés (INC-18).
 * Les candidats affichés sont ceux qui ont marqué leur intérêt ET consenti au
 * vivier (synthèse chiffrée, jamais e-mail/commentaires — vue job_offer_candidates).
 */
export default async function OffreDetailPage({ params }: { params: { id: string } }) {
  const org = await getOrgContext();
  if (!org) return <p className="text-muted">Organisme introuvable.</p>;

  // RLS : listMyCompanyOffers ne rend que les offres de la société du partenaire.
  const offers = await listMyCompanyOffers(org.id);
  const offer = offers.find((o) => o.id === params.id);
  if (!offer) {
    return (
      <div>
        <PageHeader title="Offre introuvable" />
        <Link href="/offres" className="text-brand hover:underline">← Retour à mes offres</Link>
      </div>
    );
  }

  const candidates = offer.status === "published" ? await listOfferCandidates(offer.id) : [];

  return (
    <div className="space-y-6">
      <div>
        <Link href="/offres" className="text-sm text-brand hover:underline">← Mes offres</Link>
        <PageHeader
          title={offer.title}
          description={[offer.contractType, offer.location, offer.remote].filter(Boolean).join(" · ") || undefined}
        />
        <Badge tone={offer.status === "published" ? "success" : "neutral"}>{JOB_STATUS_LABELS[offer.status]}</Badge>
      </div>

      <Card>
        <CardTitle>Description</CardTitle>
        <p className="whitespace-pre-wrap text-ink">{offer.description}</p>
      </Card>

      <Card className="p-0">
        <div className="p-4">
          <CardTitle>Candidats intéressés</CardTitle>
          <p className="text-sm text-muted">
            Apprenants ayant manifesté leur intérêt et rendu leur profil visible. Synthèse pédagogique
            (progression, validations jury) — les coordonnées sont partagées après mise en relation par la coordination.
          </p>
        </div>
        {offer.status !== "published" ? (
          <div className="p-4"><EmptyState title="Offre non publiée" description="Les candidatures apparaissent une fois l'offre validée et publiée." /></div>
        ) : candidates.length === 0 ? (
          <div className="p-4"><EmptyState title="Aucun candidat pour l'instant" description="Les apprenants intéressés apparaîtront ici." /></div>
        ) : (
          <Table>
            <THead>
              <Tr>
                <Th>Candidat</Th>
                <Th>Programme</Th>
                <Th>Progression</Th>
                <Th>Projets validés</Th>
                <Th>Note jury</Th>
                <Th>Recherche</Th>
                <Th>Intérêt le</Th>
              </Tr>
            </THead>
            <TBody>
              {candidates.map((c) => (
                <Tr key={c.learnerId}>
                  <Td className="font-medium text-ink">{[c.firstName, c.lastName].filter(Boolean).join(" ") || "—"}</Td>
                  <Td>
                    {c.program ?? "—"}
                    {c.specialty && <span className="block text-xs text-muted">{c.specialty}</span>}
                  </Td>
                  <Td>{c.progress != null ? `${c.progress}%` : "—"}</Td>
                  <Td>{c.projectsValidated ?? 0}/{c.projectsRequired ?? "—"}</Td>
                  <Td>{c.juryAvgScore != null ? <Badge tone="brand">{c.juryAvgScore}/100</Badge> : "—"}</Td>
                  <Td className="text-sm text-muted">{[c.contractSought, c.mobility].filter(Boolean).join(" · ") || "—"}</Td>
                  <Td className="text-sm text-muted">{new Date(c.interestedAt).toLocaleDateString("fr-FR")}</Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
