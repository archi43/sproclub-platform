import { getOrgContext } from "@/lib/tenant";
import { requireOrgRole, getCurrentUser } from "@/lib/auth";
import { listMyDefenses } from "@/lib/data/jury";
import { evaluationState, canEvaluate } from "@/lib/jury-rules";
import { PageHeader, EmptyState } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatTile, StatGrid } from "@/components/ui/stat";
import { EvaluationForm } from "./evaluation-form";

const dateTimeFmt = new Intl.DateTimeFormat("fr-FR", {
  weekday: "long", day: "numeric", month: "long", year: "numeric",
  hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris",
});

const TONES = {
  "à noter": "warning",
  "notée": "success",
  "à venir": "brand",
  "annulée": "neutral",
} as const;

/**
 * Portail jury — « Mes soutenances » (INC-28).
 *
 * L'évaluateur ne voit que les soutenances où la coordination l'a affecté, et
 * ne relit que SES appréciations : deux membres d'un même jury ne se lisent pas,
 * pour que leurs avis restent indépendants. La RLS (`0029`) en est le garant ;
 * cet écran ne fait que présenter ce qu'elle laisse passer.
 */
export default async function JuryEvaluationsPage() {
  const org = await getOrgContext();
  if (!org) return <p className="text-muted">Organisme introuvable.</p>;

  await requireOrgRole(org.id, ["evaluator"]);
  const user = await getCurrentUser();
  if (!user) return <p className="text-muted">Session expirée.</p>;

  const defenses = await listMyDefenses(org.id, user.id);
  const now = new Date();
  const withState = defenses.map((d) => ({
    ...d,
    state: evaluationState({ startsAt: d.startsAt, status: d.status, hasOwnReport: d.ownReport !== null }, now),
  }));

  const toGrade = withState.filter((d) => d.state === "à noter").length;
  const graded = withState.filter((d) => d.state === "notée").length;
  const upcoming = withState.filter((d) => d.state === "à venir").length;

  return (
    <div>
      <PageHeader
        eyebrow="Espace jury"
        title="Mes soutenances"
        description="Les soutenances où vous siégez. Vous ne voyez que vos propres appréciations."
      />

      <StatGrid className="mb-6">
        <StatTile label="À noter" value={toGrade} tone={toGrade > 0 ? "critical" : "neutral"} />
        <StatTile label="Notées" value={graded} />
        <StatTile label="À venir" value={upcoming} />
        <StatTile label="Total" value={withState.length} />
      </StatGrid>

      {withState.length === 0 ? (
        <EmptyState
          title="Aucune soutenance"
          description="La coordination ne vous a encore affecté à aucun jury. Les soutenances apparaîtront ici dès qu'elle l'aura fait."
        />
      ) : (
        <div className="space-y-4">
          {withState.map((d) => (
            <Card key={d.reservationId}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="font-heading text-lg font-semibold text-brand">
                    {d.learnerName}
                    {d.projectNumber != null && ` — projet ${d.projectNumber}`}
                  </h2>
                  <p className="mt-1 text-sm text-muted">
                    {[d.program, d.specialty].filter(Boolean).join(" · ") || "Programme non renseigné"}
                  </p>
                  <p className="mt-1 text-sm text-muted">{dateTimeFmt.format(new Date(d.startsAt))}</p>
                </div>
                <Badge tone={TONES[d.state]}>{d.state}</Badge>
              </div>

              {canEvaluate({ startsAt: d.startsAt, status: d.status, hasOwnReport: d.ownReport !== null }, now) ? (
                <EvaluationForm
                  reservationId={d.reservationId}
                  enrollmentId={d.enrollmentId}
                  sessionDate={d.startsAt.slice(0, 10)}
                  grade={d.ownReport?.grade ?? null}
                  body={d.ownReport?.body ?? ""}
                />
              ) : (
                <p className="mt-4 border-t border-line pt-4 text-sm text-muted">
                  {d.state === "à venir"
                    ? "La notation s'ouvrira une fois la soutenance passée."
                    : "Cette soutenance est annulée : il n'y a rien à noter."}
                </p>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
