import { getOrgContext } from "@/lib/tenant";
import { getMyTalentProfile } from "@/lib/data/talent";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { VisibilityForm } from "./visibility-form";

/**
 * Portail apprenant — « Visibilité entreprises » (INC-17).
 * L'apprenant choisit d'apparaître (nominatif, consentement explicite tracé et
 * révocable) dans le vivier consulté par les entreprises partenaires, et
 * déclare sa disponibilité.
 */
export default async function VisibilitePage() {
  const org = await getOrgContext();
  if (!org) return <p className="text-grey-600">Organisme introuvable.</p>;

  const profile = await getMyTalentProfile(org.id);
  const consented = !!profile?.consentedAt && !profile?.revokedAt;

  return (
    <div>
      <PageHeader
        title="Visibilité entreprises"
        description="Rendez votre profil visible des entreprises partenaires qui recrutent : progression, évaluations (synthèse) et disponibilité, en temps réel."
      />
      <Card>
        <div className="mb-4 flex items-center gap-2">
          <span className="text-sm font-medium text-grey-600">Statut :</span>
          {consented ? <Badge tone="success">Visible des partenaires</Badge> : <Badge tone="neutral">Non visible</Badge>}
        </div>
        <VisibilityForm
          values={{
            consented,
            availableFrom: profile?.availableFrom ?? null,
            contractSought: profile?.contractSought ?? null,
            mobility: profile?.mobility ?? null,
          }}
        />
      </Card>
    </div>
  );
}
