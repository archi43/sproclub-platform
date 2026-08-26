import Link from "next/link";
import { getOrgContext } from "@/lib/tenant";
import { getMyJourney, type Journey, type JourneyEvent } from "@/lib/data/learner-journey";
import { progressPercent } from "@/lib/journey-rules";
import { PageHeader, EmptyState } from "@/components/ui/page-header";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button";

/**
 * Portail apprenant — « Mon parcours » (écran P.A1 du CDC).
 * Quatre zones : en-tête (programme, spécialité, dates clés), progression
 * (avancement, projets validés, complétion 360L), prochaines échéances, et
 * prochain rendez-vous. Le layout garantit un `student` authentifié ; la RLS
 * borne les données à son seul dossier.
 */

const dateFmt = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "long", year: "numeric", timeZone: "Europe/Paris" });
const dateTimeFmt = new Intl.DateTimeFormat("fr-FR", {
  weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris",
});

const fmtDate = (iso: string | null) => (iso ? dateFmt.format(new Date(iso)) : "—");
const eventLabel = (kind: JourneyEvent["kind"]) => (kind === "defense" ? "Soutenance" : "Coaching");

export default async function MonParcours() {
  const org = await getOrgContext();
  if (!org) return <p className="text-muted">Organisme introuvable.</p>;

  const journeys = await getMyJourney(org.id);

  return (
    <div className="space-y-8">
      <PageHeader title="Mon parcours" description={`Votre formation chez ${org.name}, en un coup d'œil.`} />

      {journeys.length === 0 ? (
        <EmptyState
          title="Aucun dossier de formation"
          description="Vos dossiers apparaîtront ici une fois enregistrés par la coordination."
        />
      ) : (
        journeys.map((j) => <JourneyCard key={j.enrollmentId} journey={j} />)
      )}
    </div>
  );
}

function JourneyCard({ journey: j }: { journey: Journey }) {
  const percent = progressPercent(j.progress);
  const validated = j.deliverables.filter((d) => d.validatedAt).length;
  const submitted = j.deliverables.filter((d) => d.submitted).length;
  const required = j.projectsRequired ?? (j.deliverables.length || null);

  return (
    <section className="space-y-4">
      {/* Alertes : échéance proche, accès qui expire, document à fournir */}
      {j.alerts.map((a) => (
        <Alert key={a.key} tone={a.tone}>{a.message}</Alert>
      ))}

      {/* Zone 1 — en-tête : programme, spécialité, dates clés */}
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-heading text-lg font-semibold text-brand">{j.program ?? "Programme"}</h2>
            {j.specialty && <p className="mt-1 text-sm text-muted">{j.specialty}</p>}
          </div>
          <Badge tone="brand">{j.status ?? "Statut inconnu"}</Badge>
        </div>

        <dl className="mt-5 grid gap-4 border-t border-line pt-5 sm:grid-cols-2 lg:grid-cols-4">
          <Info label="Début" value={fmtDate(j.startDate)} />
          <Info label="Fin prévue" value={fmtDate(j.endDate)} />
          <Info label="Accès aux serveurs" value={fmtDate(j.accessEndDate)} />
          <Info label="Coach référent" value={j.coachEmail ?? "À affecter"} />
        </dl>
      </Card>

      {/* Zone 2 — progression */}
      <Card>
        <CardTitle>Ma progression</CardTitle>
        {percent == null && j.deliverables.length === 0 ? (
          <p className="text-sm text-muted">
            Votre avancement apparaîtra ici dès que votre formation aura démarré sur 360Learning.
          </p>
        ) : (
          <div className="space-y-4">
            {percent != null && (
              <div>
                <div className="flex items-baseline justify-between">
                  <span className="text-sm text-muted">Avancement 360Learning</span>
                  <span className="font-heading text-xl font-semibold text-brand tabular-nums">{percent} %</span>
                </div>
                <div
                  className="mt-2 h-2 overflow-hidden rounded-full bg-brand-tint"
                  role="progressbar"
                  aria-valuenow={percent}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label="Avancement de la formation"
                >
                  <div className="h-full rounded-full bg-brand" style={{ width: `${percent}%` }} />
                </div>
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-3">
              <Info
                label="Projets validés par le jury"
                value={required ? `${validated} / ${required}` : String(validated)}
              />
              <Info label="Livrables déposés" value={String(submitted)} />
              <Info
                label="Retard"
                value={j.lateDays != null && j.lateDays > 0 ? `${j.lateDays} jour(s)` : "À jour"}
                tone={j.lateDays != null && j.lateDays > 0 ? "warning" : undefined}
              />
            </div>

            {j.deliverables.length > 0 && (
              <ul className="flex flex-wrap gap-2 border-t border-line pt-4">
                {j.deliverables.map((d) => (
                  <li key={d.projectNumber}>
                    <Badge tone={d.validatedAt ? "success" : d.submitted ? "brand" : "neutral"}>
                      Projet {d.projectNumber}
                      {d.validatedAt ? " — validé" : d.submitted ? " — déposé" : " — à venir"}
                      {d.score != null ? ` (${d.score}/100)` : ""}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </Card>

      {/* Zones 3 et 4 — prochaines échéances et prochain rendez-vous */}
      <Card>
        <CardTitle>Mes prochaines échéances</CardTitle>
        {j.upcoming.length === 0 ? (
          <div className="space-y-4">
            <p className="text-sm text-muted">Aucun rendez-vous programmé pour le moment.</p>
            <div className="flex flex-wrap gap-2">
              <ButtonLink href="/mon-parcours/reservation" size="sm">Réserver un coaching</ButtonLink>
              <ButtonLink href="/mon-parcours/soutenance" variant="secondary" size="sm">Réserver ma soutenance</ButtonLink>
            </div>
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {j.upcoming.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                <div>
                  <p className="text-sm font-medium text-ink">
                    {eventLabel(e.kind)}
                    {e.projectNumber != null ? ` — projet ${e.projectNumber}` : ""}
                  </p>
                  <p className="text-sm text-muted">{dateTimeFmt.format(new Date(e.startsAt))}</p>
                </div>
                <Badge tone={e.status === "pending" ? "warning" : "success"}>
                  {e.status === "pending" ? "À confirmer" : "Confirmé"}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <p className="text-sm text-muted">
        Vos cours et vos dépôts de projet se passent sur 360Learning.{" "}
        <Link href="/mon-parcours/livrables">Voir mes livrables</Link> ·{" "}
        <Link href="/mon-parcours/dossier">Mon dossier et mes documents</Link>
      </p>
    </section>
  );
}

function Info({ label, value, tone }: { label: string; value: string; tone?: "warning" }) {
  return (
    <div>
      <dt className="text-xs font-medium text-muted">{label}</dt>
      <dd className={`mt-1 text-sm ${tone === "warning" ? "font-medium text-warning-ink" : "text-ink"}`}>{value}</dd>
    </div>
  );
}
