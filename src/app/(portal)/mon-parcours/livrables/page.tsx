import { getOrgContext } from "@/lib/tenant";
import { getDeliverables } from "@/lib/data/deliverables";
import { PageHeader, EmptyState } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DeliverableForm } from "./deliverable-form";

/**
 * Student portal — "Mes livrables" (écran de dépôt).
 * Submitting a deliverable opens the defense booking for that project (gate in DB, 0004).
 */
export default async function DeliverablesPage() {
  const org = await getOrgContext();
  if (!org) return <p className="text-grey-600">Organisme introuvable.</p>;

  const deliverables = await getDeliverables(org.id);

  return (
    <div>
      <PageHeader title="Mes livrables" description="Déposez vos livrables ; le dépôt ouvre la réservation de soutenance." />
      {deliverables.length === 0 ? (
        <EmptyState title="Aucun projet à rendre" description="Vos projets à rendre apparaîtront ici." />
      ) : (
        <ul className="space-y-4">
          {deliverables.map((d) => (
            <li key={d.id}>
              <Card>
                <div className="flex items-center justify-between gap-3">
                  <p className="font-heading font-semibold text-brand">Projet {d.project_number}</p>
                  {d.deliverable_submitted && <Badge tone="success">Déposé</Badge>}
                </div>
                {d.deliverable_submitted ? (
                  <p className="mt-2 text-sm text-grey-600">
                    {d.deliverable_url ? (
                      <a href={d.deliverable_url} target="_blank" rel="noreferrer">
                        Voir le livrable
                      </a>
                    ) : (
                      "Livrable déposé."
                    )}
                  </p>
                ) : (
                  <div className="mt-3">
                    <DeliverableForm deliverableId={d.id} />
                  </div>
                )}
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
