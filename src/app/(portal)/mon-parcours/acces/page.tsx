import { getOrgContext } from "@/lib/tenant";
import { getMyResources, type ResourceAccess } from "@/lib/data/resources";
import type { AssignmentStatus } from "@/lib/resource-rules";
import { PageHeader, EmptyState } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PasswordReveal } from "./password-reveal";

/**
 * Portail apprenant — « Mes accès » (INC-30).
 *
 * Les accès techniques affectés par la coordination (serveur SAP, Learning Hub,
 * BTP…) : identifiant, période de validité, et mot de passe à la demande pendant
 * cette période. La RLS borne la liste aux dossiers de l'apprenant ; le mot de
 * passe ne figure jamais dans la page rendue par le serveur.
 */

const dateFmt = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const fmt = (iso: string) => dateFmt.format(new Date(`${iso}T00:00:00Z`));

const STATUS: Record<AssignmentStatus, { label: string; tone: "success" | "brand" | "neutral" }> = {
  active: { label: "En cours", tone: "success" },
  upcoming: { label: "À venir", tone: "brand" },
  expired: { label: "Terminé", tone: "neutral" },
};

function period(a: ResourceAccess): string {
  if (a.startsOn && a.endsOn) return `Du ${fmt(a.startsOn)} au ${fmt(a.endsOn)}`;
  if (a.endsOn) return `Jusqu'au ${fmt(a.endsOn)}`;
  if (a.startsOn) return `À partir du ${fmt(a.startsOn)}`;
  return "Sans date de fin";
}

export default async function AccessPage() {
  const org = await getOrgContext();
  if (!org) return <p className="text-muted">Organisme introuvable.</p>;

  const accesses = await getMyResources(org.id);
  const severalPrograms = new Set(accesses.map((a) => a.enrollmentId)).size > 1;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Mes accès"
        description="Les serveurs et plateformes mis à votre disposition pour vos projets, avec vos identifiants."
      />

      {accesses.length === 0 ? (
        <EmptyState
          title="Aucun accès affecté pour le moment"
          description="Vos accès apparaîtront ici dès que la coordination vous les aura attribués, en général avant le démarrage du projet qui en a besoin."
        />
      ) : (
        <ul className="space-y-4">
          {accesses.map((a) => (
            <li key={a.id}>
              <AccessCard access={a} showProgram={severalPrograms} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AccessCard({ access: a, showProgram }: { access: ResourceAccess; showProgram: boolean }) {
  const status = STATUS[a.status];
  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-heading text-base font-semibold text-brand">{a.type ?? "Accès"}</h2>
          {(a.category || (showProgram && a.program)) && (
            <p className="mt-0.5 text-sm text-muted">
              {[a.category, showProgram ? a.program : null].filter(Boolean).join(" · ")}
            </p>
          )}
        </div>
        <Badge tone={status.tone}>{status.label}</Badge>
      </div>

      <dl className="mt-4 grid gap-4 border-t border-line pt-4 sm:grid-cols-2">
        <div>
          <dt className="text-xs font-medium text-muted">Identifiant</dt>
          <dd className="mt-1 select-all font-mono text-sm text-ink">{a.label}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-muted">Période</dt>
          <dd className="mt-1 text-sm text-ink">{period(a)}</dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-xs font-medium text-muted">Mot de passe</dt>
          <dd className="mt-1">
            {a.canReveal ? (
              <PasswordReveal assignmentId={a.id} label={a.label} />
            ) : a.status === "upcoming" && a.startsOn ? (
              <p className="text-sm text-muted">{`Disponible à partir du ${fmt(a.startsOn)}.`}</p>
            ) : (
              <p className="text-sm text-muted">
                Cet accès a pris fin. Si vous en avez encore besoin, contactez la coordination.
              </p>
            )}
          </dd>
        </div>
      </dl>
    </Card>
  );
}
