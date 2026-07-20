import { getOrgContext } from "@/lib/tenant";
import { listTalentPool, getMyPartnerCompany } from "@/lib/data/talent";
import { computeAvailability, type Availability } from "@/lib/talent-rules";
import { PageHeader, EmptyState } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, Tr, Th, Td } from "@/components/ui/table";
import { Select } from "@/components/ui/form";
import { Button } from "@/components/ui/button";

/**
 * Portail entreprise partenaire — vivier de talents (INC-17).
 * Temps réel : progression et validations jury remontent de 360Learning toutes
 * les heures. Seuls les candidats ayant CONSENTI apparaissent (vue 0025) ; les
 * évaluations sont en synthèse chiffrée, jamais les commentaires internes.
 */
export default async function VivierPage({
  searchParams,
}: {
  searchParams: { programme?: string; dispo?: string };
}) {
  const org = await getOrgContext();
  if (!org) return <p className="text-muted">Organisme introuvable.</p>;
  const { programme, dispo } = searchParams;

  const [pool, company] = await Promise.all([listTalentPool(org.id), getMyPartnerCompany(org.id)]);

  const today = new Date().toISOString().slice(0, 10);
  const withAvailability = pool.map((c) => ({ candidate: c, availability: computeAvailability({
    staffStatus: c.staffStatus,
    availableFrom: c.availableFrom,
    endDate: c.endDate,
    enrollmentStatus: c.enrollmentStatus,
    today,
  }) }));

  const programs = [...new Set(pool.map((c) => c.program).filter(Boolean))].sort() as string[];
  const filtered = withAvailability.filter(({ candidate, availability }) => {
    if (programme && candidate.program !== programme) return false;
    if (dispo === "disponible" && availability.state !== "available") return false;
    if (dispo === "bientot" && !["available", "soon"].includes(availability.state)) return false;
    return true;
  });

  const availableNow = withAvailability.filter(({ availability }) => availability.state === "available").length;
  const scored = pool.filter((c) => c.juryAvgScore != null);
  const avgScore = scored.length > 0 ? Math.round((scored.reduce((a, c) => a + (c.juryAvgScore ?? 0), 0) / scored.length) * 10) / 10 : null;

  return (
    <div>
      <PageHeader
        title="Vivier de talents"
        description={`${company ? `${company.name} — ` : ""}candidats consentants, données pédagogiques en temps réel (360Learning, actualisation horaire).`}
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Card>
          <p className="text-sm text-muted">Candidats visibles</p>
          <p className="mt-1 font-heading text-3xl font-bold text-brand">{pool.length}</p>
        </Card>
        <Card>
          <p className="text-sm text-muted">Disponibles maintenant</p>
          <p className="mt-1 font-heading text-3xl font-bold text-success">{availableNow}</p>
        </Card>
        <Card>
          <p className="text-sm text-muted">Note jury moyenne</p>
          <p className="mt-1 font-heading text-3xl font-bold text-brand">{avgScore != null ? `${avgScore}/100` : "—"}</p>
        </Card>
      </div>

      <form method="GET" className="mb-4 flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="filter-programme" className="mb-1 block text-sm font-medium text-muted">Programme</label>
          <Select id="filter-programme" name="programme" defaultValue={programme ?? ""}>
            <option value="">Tous</option>
            {programs.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </Select>
        </div>
        <div>
          <label htmlFor="filter-dispo" className="mb-1 block text-sm font-medium text-muted">Disponibilité</label>
          <Select id="filter-dispo" name="dispo" defaultValue={dispo ?? ""}>
            <option value="">Tous</option>
            <option value="disponible">Disponibles maintenant</option>
            <option value="bientot">Disponibles ou bientôt</option>
          </Select>
        </div>
        <Button type="submit" variant="secondary">Filtrer</Button>
      </form>

      {filtered.length === 0 ? (
        <EmptyState
          title="Aucun candidat"
          description="Aucun candidat consentant ne correspond à ces filtres pour le moment."
        />
      ) : (
        <Card className="p-0">
          <Table>
            <THead>
              <Tr>
                <Th>Candidat</Th>
                <Th>Programme</Th>
                <Th>Progression</Th>
                <Th>Projets validés (jury)</Th>
                <Th>Note jury</Th>
                <Th>Assiduité</Th>
                <Th>Disponibilité</Th>
                <Th>Recherche</Th>
              </Tr>
            </THead>
            <TBody>
              {filtered.map(({ candidate: c, availability }) => (
                <Tr key={c.learnerId}>
                  <Td className="font-medium text-ink">{[c.firstName, c.lastName].filter(Boolean).join(" ") || "—"}</Td>
                  <Td>
                    {c.program ?? "—"}
                    {c.specialty && <span className="block text-xs text-muted">{c.specialty}</span>}
                  </Td>
                  <Td><ProgressCell progress={c.progress} /></Td>
                  <Td>
                    {c.projectsValidated ?? 0}/{c.projectsRequired ?? "—"}
                    {c.juryValidatedCount > 0 && (
                      <span className="block text-xs text-muted">{c.juryValidatedCount} validation(s) jury</span>
                    )}
                  </Td>
                  <Td>{c.juryAvgScore != null ? <Badge tone="brand">{c.juryAvgScore}/100</Badge> : "—"}</Td>
                  <Td>
                    {c.lateDays != null && c.lateDays > 0 ? (
                      <Badge tone="warning">{c.lateDays} j de retard</Badge>
                    ) : (
                      <Badge tone="success">À jour</Badge>
                    )}
                  </Td>
                  <Td><AvailabilityBadge availability={availability} /></Td>
                  <Td className="text-sm text-muted">
                    {[c.contractSought, c.mobility].filter(Boolean).join(" · ") || "—"}
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        </Card>
      )}
    </div>
  );
}

function ProgressCell({ progress }: { progress: number | null }) {
  if (progress == null) return <span>—</span>;
  const pct = Math.max(0, Math.min(100, progress));
  return (
    <div className="min-w-[8rem]">
      <div className="flex items-center justify-between text-xs text-muted">
        <span>{pct}%</span>
      </div>
      <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-brand-tint" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full rounded-full bg-brand" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function AvailabilityBadge({ availability }: { availability: Availability }) {
  return <Badge tone={availability.tone}>{availability.label}</Badge>;
}
