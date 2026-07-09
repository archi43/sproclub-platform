import { getOrgContext } from "@/lib/tenant";
import { getDefenses, getPoolEvaluators, type JuryEvaluator } from "@/lib/data/coordination";
import { PageHeader, EmptyState } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AssignForm, ConfirmForm, type Candidate } from "./jury-forms";

const fmt = new Intl.DateTimeFormat("fr-FR", {
  weekday: "long",
  day: "numeric",
  month: "long",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Paris",
});

function evaluatorLabel(e: JuryEvaluator): string {
  return e.name ? `${e.name} (${e.email})` : e.email;
}

/** Coordination — jury assignment (écran staff). */
export default async function CoordinationPage() {
  const org = await getOrgContext();
  if (!org) return <p className="text-grey-600">Organisme introuvable.</p>;

  const defenses = await getDefenses(org.id);
  const candidatesByDefense = await Promise.all(
    defenses.map(async (d): Promise<Candidate[]> => {
      if (!d.program) return [];
      const pool = await getPoolEvaluators(org.id, d.program);
      const assigned = new Set(d.evaluators.map((e) => e.evaluatorId));
      const coach = (d.coachEmail ?? "").toLowerCase();
      return pool
        .filter((e) => !assigned.has(e.evaluatorId) && e.email.toLowerCase() !== coach)
        .map((e) => ({ evaluatorId: e.evaluatorId, label: evaluatorLabel(e) }));
    })
  );

  return (
    <div>
      <PageHeader title="Affectation des jurys" description="Deux évaluateurs par soutenance, jamais le coach référent." />
      {defenses.length === 0 ? (
        <EmptyState title="Aucune soutenance à traiter" description="Les soutenances réservées apparaîtront ici." />
      ) : (
        <ul className="space-y-4">
          {defenses.map((d, i) => {
            const complete = d.evaluators.length === 2;
            return (
              <li key={d.id}>
                <Card>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-heading font-semibold text-brand">
                        {d.learnerName} — Projet {d.projectNumber}
                      </p>
                      <p className="text-sm text-grey-600">
                        {d.program ?? "Programme ?"} · {fmt.format(new Date(d.startsAt))}
                      </p>
                    </div>
                    <Badge tone={d.status === "confirmed" ? "success" : "warning"}>{d.status}</Badge>
                  </div>

                  <p className="mt-2 text-sm text-grey-600">
                    Coach référent (exclu du jury) : {d.coachEmail ?? "—"}
                  </p>

                  <p className="mt-2 text-sm">
                    <span className="font-semibold text-brand">Jury ({d.evaluators.length}/2)</span> :{" "}
                    {d.evaluators.length === 0 ? "aucun évaluateur" : d.evaluators.map(evaluatorLabel).join(", ")}
                  </p>

                  {!complete && (
                    <div className="mt-3">
                      {candidatesByDefense[i].length === 0 ? (
                        <p className="text-sm italic text-grey-600">Aucun évaluateur éligible dans le vivier de ce programme.</p>
                      ) : (
                        <AssignForm reservationId={d.id} candidates={candidatesByDefense[i]} />
                      )}
                    </div>
                  )}

                  {complete && d.status !== "confirmed" && (
                    <div className="mt-3">
                      <ConfirmForm reservationId={d.id} />
                    </div>
                  )}
                  {d.status === "confirmed" && <p className="mt-3 text-sm text-success">✓ Soutenance confirmée</p>}
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
