import Link from "next/link";
import { getOrgContext } from "@/lib/tenant";
import { listPublishedOffers, listMyInterestOfferIds } from "@/lib/data/jobs";
import { getMyTalentProfile } from "@/lib/data/talent";
import { PageHeader, EmptyState } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { InterestButton } from "./interest-button";

/**
 * Portail apprenant — offres d'emploi des entreprises partenaires (INC-18).
 * Offres publiées uniquement (RLS). L'apprenant marque son intérêt en un clic ;
 * pour que le recruteur voie son profil, il doit activer sa visibilité (INC-17).
 */
export default async function OffresApprenantPage() {
  const org = await getOrgContext();
  if (!org) return <p className="text-grey-600">Organisme introuvable.</p>;

  const [offers, interested, talent] = await Promise.all([
    listPublishedOffers(org.id),
    listMyInterestOfferIds(org.id),
    getMyTalentProfile(org.id),
  ]);
  const isVisible = !!talent?.consentedAt && !talent?.revokedAt;

  return (
    <div>
      <PageHeader
        title="Offres d'emploi"
        description="Les entreprises partenaires de SproCLUB recrutent. Manifestez votre intérêt en un clic."
      />

      {!isVisible && (
        <Alert tone="info" className="mb-4">
          Pour que les recruteurs voient votre profil quand vous manifestez votre intérêt, activez votre visibilité
          dans <Link href="/mon-parcours/visibilite" className="font-medium underline">Visibilité entreprises</Link>.
        </Alert>
      )}

      {offers.length === 0 ? (
        <EmptyState title="Aucune offre pour l'instant" description="Les offres des entreprises partenaires apparaîtront ici." />
      ) : (
        <ul className="space-y-4">
          {offers.map((o) => (
            <li key={o.id}>
              <Card>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-heading text-lg font-semibold text-brand">{o.title}</p>
                    <p className="text-sm text-grey-600">
                      {o.companyName ?? "Entreprise partenaire"}
                      {o.contractType ? ` · ${o.contractType}` : ""}
                      {o.location ? ` · ${o.location}` : ""}
                      {o.remote ? ` · ${o.remote}` : ""}
                    </p>
                  </div>
                  {interested.has(o.id) && <Badge tone="success">Intérêt manifesté</Badge>}
                </div>
                <p className="mt-3 whitespace-pre-wrap text-ink">{o.description}</p>
                <div className="mt-4">
                  <InterestButton offerId={o.id} interested={interested.has(o.id)} />
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
