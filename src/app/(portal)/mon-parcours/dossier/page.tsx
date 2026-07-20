import type { ReactNode } from "react";
import { getOrgContext } from "@/lib/tenant";
import { getCurrentUser } from "@/lib/auth";
import { getMyDossiers, listMyDocuments } from "@/lib/data/learner-dossier";
import { PageHeader, EmptyState } from "@/components/ui/page-header";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const pct = (v: number | null) => (v != null ? `${Math.round(v * 100)} %` : "—");
const val = (v: unknown) => (v === null || v === undefined || v === "" ? "—" : String(v));

/** Écran P.A2 — « Mon dossier » : résultats, certification, insertion,
 *  satisfaction, et documents (Storage isolé). Portail apprenant (student). */
export default async function MonDossierPage() {
  const org = await getOrgContext();
  if (!org) return <p className="text-muted">Organisme introuvable.</p>;
  const user = await getCurrentUser();
  if (!user?.email) return <p className="text-muted">Session expirée.</p>;

  const [dossiers, documents] = await Promise.all([
    getMyDossiers(org.id),
    listMyDocuments(org.id),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader title="Mon dossier" description="Vos résultats, votre insertion et vos documents." />

      {dossiers.length === 0 ? (
        <EmptyState title="Aucun dossier" description="Aucun dossier de formation ne vous est rattaché." />
      ) : (
        dossiers.map((d) => (
          <div key={d.enrollmentId} className="space-y-4">
            {dossiers.length > 1 && <h2 className="font-heading text-lg font-semibold text-brand">{val(d.program)}</h2>}

            <Card>
              <CardTitle>Résultats</CardTitle>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
                <Row label="Programme" value={val(d.program)} />
                <Row label="Spécialité" value={val(d.specialty)} />
                <Row label="Statut" value={val(d.status)} />
                <Row label="Avancement" value={pct(d.progress)} />
                <Row label="Projets validés" value={`${val(d.projectsValidated)} / ${val(d.projectsRequired)}`} />
                <Row label="Note globale (sur 4)" value={val(d.globalGrade)} />
              </dl>
            </Card>

            <Card>
              <CardTitle>Certification</CardTitle>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
                <Row label="Certification" value={val(d.certification)} />
                <Row label="Date d'examen" value={val(d.certificationExamDate)} />
                <Row label="Résultat du jury" value={val(d.juryResult)} />
              </dl>
            </Card>

            <Card>
              <CardTitle>Insertion professionnelle</CardTitle>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
                <Row label="Situation" value={val(d.insertionSituation)} />
                <Row label="Poste" value={val(d.insertionRole)} />
                <Row label="Entreprise" value={val(d.insertionCompany)} />
              </dl>
            </Card>

            <Card>
              <CardTitle>Satisfaction</CardTitle>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
                <Row label="Score moyen" value={val(d.satisfactionScore)} />
                <Row label="NPS" value={val(d.nps)} />
              </dl>
            </Card>
          </div>
        ))
      )}

      <Card>
        <CardTitle>Mes documents</CardTitle>
        {documents.length === 0 ? (
          <EmptyState title="Aucun document" description="Vos attestations et documents apparaîtront ici." />
        ) : (
          <ul className="divide-y divide-line/60">
            {documents.map((doc) => (
              <li key={doc.name} className="flex items-center justify-between gap-3 py-2.5">
                <span className="text-sm text-ink">{doc.name}</span>
                {doc.url ? (
                  <a href={doc.url} target="_blank" rel="noopener noreferrer" aria-label={`Télécharger ${doc.name}`} className="text-sm text-brand no-underline hover:underline">
                    Télécharger
                  </a>
                ) : (
                  <Badge tone="warning">indisponible</Badge>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="font-medium text-ink">{value}</dd>
    </div>
  );
}
