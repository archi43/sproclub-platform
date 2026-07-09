import { getOrgContext } from "@/lib/tenant";
import { getDefenses, getPoolEvaluators, type JuryEvaluator } from "@/lib/data/coordination";
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

/**
 * Coordination — jury assignment (écran staff).
 * Assign exactly two evaluators (never the referent coach, always from the
 * program pool — enforced by DB triggers) then confirm the defense.
 */
export default async function CoordinationPage() {
  const org = await getOrgContext();
  if (!org) return <div><p>Organisme introuvable.</p></div>;

  const defenses = await getDefenses(org.id);

  // Candidate evaluators per defense: pool for the program, minus the referent
  // coach and anyone already on the jury.
  const candidatesByDefense = await Promise.all(
    defenses.map(async (d) => {
      if (!d.program) return [] as Candidate[];
      const pool = await getPoolEvaluators(org.id, d.program);
      const assigned = new Set(d.evaluators.map((e) => e.evaluatorId));
      const coach = (d.coachEmail ?? "").toLowerCase();
      return pool
        .filter((e) => !assigned.has(e.evaluatorId) && e.email.toLowerCase() !== coach)
        .map((e) => ({ evaluatorId: e.evaluatorId, label: evaluatorLabel(e) }));
    })
  );

  return (
    <div className="space-y-5">
      <h1>Affectation des jurys</h1>
      {defenses.length === 0 ? (
        <p>Aucune soutenance à traiter pour le moment.</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, display: "flex", flexDirection: "column", gap: 20 }}>
          {defenses.map((d, i) => {
            const complete = d.evaluators.length === 2;
            return (
              <li key={d.id} style={{ border: "1px solid #e5e5e5", borderRadius: 8, padding: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                  <strong>
                    {d.learnerName} — Projet {d.projectNumber} — {d.program ?? "programme ?"}
                  </strong>
                  <span style={{ color: "#555" }}>
                    {fmt.format(new Date(d.startsAt))} · {d.status}
                  </span>
                </div>
                <p style={{ margin: "8px 0", color: "#555" }}>
                  Coach référent (exclu du jury) : {d.coachEmail ?? "—"}
                </p>

                <p style={{ margin: "4px 0" }}>
                  <strong>Jury ({d.evaluators.length}/2)</strong> :{" "}
                  {d.evaluators.length === 0
                    ? "aucun évaluateur"
                    : d.evaluators.map((e) => evaluatorLabel(e)).join(", ")}
                </p>

                {!complete && (
                  <div style={{ marginTop: 8 }}>
                    {candidatesByDefense[i].length === 0 ? (
                      <em>Aucun évaluateur éligible dans le vivier de ce programme.</em>
                    ) : (
                      <AssignForm reservationId={d.id} candidates={candidatesByDefense[i]} />
                    )}
                  </div>
                )}

                {complete && d.status !== "confirmed" && (
                  <div style={{ marginTop: 8 }}>
                    <ConfirmForm reservationId={d.id} />
                  </div>
                )}
                {d.status === "confirmed" && (
                  <p style={{ color: "#0a7d33", marginTop: 8 }}>✓ Soutenance confirmée</p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
