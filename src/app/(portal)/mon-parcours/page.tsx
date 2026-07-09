import { getOrgContext } from "@/lib/tenant";
import { getEnrollmentsForOrg } from "@/lib/data/enrollments";
import { PageHeader, EmptyState } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

/**
 * Student portal — "Mon parcours" (pilot, écran P.A1).
 * The portal layout guarantees an authenticated `student` member of `org`.
 * Data isolation is enforced by RLS in the data-access layer.
 */
export default async function MonParcours() {
  const org = await getOrgContext();
  if (!org) return <p className="text-grey-600">Organisme introuvable.</p>;

  const enrollments = await getEnrollmentsForOrg(org.id);

  return (
    <div>
      <PageHeader title="Mon parcours" description={`Vos dossiers de formation chez ${org.name}.`} />
      {enrollments.length === 0 ? (
        <EmptyState title="Aucun dossier de formation" description="Vos dossiers apparaîtront ici une fois enregistrés." />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {enrollments.map((e) => (
            <li key={e.id}>
              <Card>
                <div className="flex items-start justify-between gap-3">
                  <p className="font-heading font-semibold text-brand">{e.program ?? "Programme"}</p>
                  <Badge tone="brand">{e.status ?? "Statut inconnu"}</Badge>
                </div>
                {e.specialty && <p className="mt-1 text-sm text-grey-600">{e.specialty}</p>}
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
