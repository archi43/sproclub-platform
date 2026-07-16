import type { ReactNode } from "react";
import Link from "next/link";
import { headers } from "next/headers";
import { getOrgContext } from "@/lib/tenant";
import { getLearnerSheet } from "@/lib/data/admin-learners";
import { getTalentProfileForLearner } from "@/lib/data/talent";
import { TalentStatusForm } from "./talent-ui";
import { listReportsForLearner } from "@/lib/data/coaching";
import { listEmissions, type Emission } from "@/lib/data/documents-admin";
import { learnerAuditTrail, logDossierAccess } from "@/lib/data/rgpd";
import { getRolesForOrg } from "@/lib/auth";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { GenerateDocuments } from "./documents-ui";
import { EraseLearner } from "./rgpd-ui";

const pct = (v: unknown) => (typeof v === "number" ? `${Math.round(v * 100)}%` : "—");
const val = (v: unknown) => (v === null || v === undefined || v === "" ? "—" : String(v));
const bool = (v: unknown) => (v === true ? "Oui" : v === false ? "Non" : "—");

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3">
      <span className="min-w-48 shrink-0 text-grey-600">{label}</span>
      <span className="text-ink">{value}</span>
    </div>
  );
}
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card>
      <h3 className="mb-3 text-sm font-semibold text-brand">{title}</h3>
      <div className="grid gap-1.5 text-sm">{children}</div>
    </Card>
  );
}

/** Module 2 / S2.2 — 360 learner sheet on real data. */
export default async function FicheApprenant({ params }: { params: { id: string } }) {
  const org = await getOrgContext();
  if (!org) return <p className="text-grey-600">Organisme introuvable.</p>;

  const [sheet, reports] = await Promise.all([
    getLearnerSheet(org.id, params.id),
    listReportsForLearner(org.id, params.id),
  ]);
  if (!sheet) {
    return (
      <div className="space-y-4">
        <Link href="/coordination/apprenants" className="text-sm">← Apprenants</Link>
        <p className="text-grey-600">Apprenant introuvable (ou hors de votre périmètre).</p>
      </div>
    );
  }

  const { learner, enrollments } = sheet;
  const name = [learner.first_name, learner.last_name].filter(Boolean).join(" ") || learner.email;
  const emissionsByEnrollment = await Promise.all(enrollments.map((e) => listEmissions(org.id, String(e.id))));

  // RGPD: audit this dossier access; load the trail + the caller's roles. Skip a
  // Next.js router prefetch (hovering the list) — it is not a real consultation
  // and would pollute the journal's probative value.
  const isPrefetch = headers().get("next-router-prefetch") === "1";
  if (!isPrefetch) await logDossierAccess("dossier.view", params.id);
  const [audit, roles, talent] = await Promise.all([
    learnerAuditTrail(org.id, params.id),
    getRolesForOrg(org.id),
    getTalentProfileForLearner(org.id, params.id),
  ]);
  const isDirection = roles.includes("direction");

  return (
    <div className="max-w-3xl space-y-5">
      <Link href="/coordination/apprenants" className="text-sm">← Apprenants</Link>
      <PageHeader title={name} />

      <Section title="Identité">
        <Field label="Nom" value={name} />
        <Field label="E-mail" value={learner.email} />
        <Field label="Téléphone" value={val(learner.phone)} />
        <Field label="Ville" value={val(learner.city)} />
        <Field label="Type de stagiaire" value={val(learner.trainee_type)} />
      </Section>

      {enrollments.length === 0 && <p className="text-sm text-grey-600">Aucun dossier de formation.</p>}
      {enrollments.map((e, i) => (
        <div key={String(e.id ?? i)} className="space-y-3">
          <h2 className="text-lg font-semibold text-brand">Dossier — {val(e.program)}</h2>

          <Section title="Inscription">
            <Field label="Programme" value={val(e.program)} />
            <Field label="Spécialité" value={val(e.specialty)} />
            <Field label="Financeur" value={val(e.financer)} />
            <Field label="Statut" value={val(e.status)} />
            <Field label="Début" value={val(e.start_date)} />
            <Field label="Fin des accès" value={val(e.access_end_date)} />
            <Field label="Coach référent" value={val(e.coach_email)} />
            <Field label="Site" value={val(e.site)} />
          </Section>

          <Section title="Avancement">
            <Field label="Avancement réel" value={pct(e.progress)} />
            <Field label="Retard (jours)" value={val(e.late_days)} />
            <Field label="Projets validés / obligatoires" value={`${val(e.projects_validated)} / ${val(e.projects_required)}`} />
            <Field label="Note globale (sur 4)" value={val(e.global_grade)} />
          </Section>

          <Section title="Certification">
            <Field label="Certification obtenue" value={val(e.certification)} />
            <Field label="Date d'examen" value={val(e.certification_exam_date)} />
            <Field label="Résultat jury" value={val(e.jury_result)} />
          </Section>

          <Section title="Insertion professionnelle">
            <Field label="Situation" value={val(e.insertion_situation)} />
            <Field label="Poste" value={val(e.insertion_role)} />
            <Field label="Type de contrat" value={val(e.insertion_contract)} />
            <Field label="Entreprise" value={val(e.insertion_company)} />
          </Section>

          <Section title="Satisfaction">
            <Field label="Score moyen" value={val(e.satisfaction_score)} />
            <Field label="NPS" value={val(e.nps)} />
          </Section>

          <Section title="Conformité">
            <Field label="Attestation d'entrée envoyée" value={bool(e.attestation_entry_sent)} />
            <Field label="Attestation de fin envoyée" value={bool(e.attestation_end_sent)} />
            <Field label="Convention signée" value={bool(e.convention_signed)} />
          </Section>

          <Section title="Documents (génération)">
            <GenerateDocuments enrollmentId={String(e.id)} learnerId={params.id} />
            {emissionsByEnrollment[i].length > 0 && (
              <ul className="mt-3 divide-y divide-grey-300/60">
                {emissionsByEnrollment[i].map((doc: Emission) => (
                  <li key={doc.id} className="flex items-center justify-between gap-3 py-2">
                    <span>
                      {doc.kindLabel}
                      <span className="ml-2 text-xs text-grey-600">{doc.generatedAt.slice(0, 10)}</span>
                    </span>
                    {doc.url ? (
                      <a href={doc.url} target="_blank" rel="noopener noreferrer" aria-label={`Télécharger ${doc.kindLabel}`} className="text-sm text-brand no-underline hover:underline">
                        Télécharger
                      </a>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>
      ))}

      <Section title="Comptes rendus de coaching">
        {reports.length === 0 ? (
          <span className="text-grey-600">Aucun compte rendu saisi par le coach.</span>
        ) : (
          <ul className="space-y-2">
            {reports.map((r) => (
              <li key={r.id} className="rounded-lg border border-grey-300 bg-surface p-3">
                <div className="mb-1 flex items-center gap-2 text-xs text-grey-600">
                  <span>{val(r.sessionDate ?? r.createdAt.slice(0, 10))}</span>
                  {r.grade != null && <Badge tone="brand">Note {r.grade}</Badge>}
                </div>
                <p className="whitespace-pre-wrap text-ink">{r.body}</p>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Vivier de talents (entreprises partenaires)">
        <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-grey-600">Consentement :</span>
          {talent?.consentedAt && !talent.revokedAt ? (
            <Badge tone="success">Visible des partenaires (consenti le {val(talent.consentedAt.slice(0, 10))})</Badge>
          ) : talent?.revokedAt ? (
            <Badge tone="warning">Consentement révoqué</Badge>
          ) : (
            <Badge tone="neutral">Jamais consenti</Badge>
          )}
          {talent?.availableFrom && <span className="text-grey-600">· dispo déclarée : {val(talent.availableFrom)}</span>}
          {talent?.contractSought && <span className="text-grey-600">· {talent.contractSought}</span>}
        </div>
        <TalentStatusForm learnerId={params.id} current={talent?.staffStatus ?? null} />
      </Section>

      <Section title="RGPD">
        <div className="flex flex-wrap items-center gap-3">
          <a
            href={`/coordination/apprenants/${params.id}/rgpd/export`}
            className={buttonClasses({ variant: "secondary" })}
          >
            Exporter les données (JSON)
          </a>
          {isDirection && <EraseLearner learnerId={params.id} />}
        </div>

        <div className="mt-4">
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-grey-600">Journal d&apos;accès</h4>
          {audit.length === 0 ? (
            <span className="text-grey-600">Aucun accès tracé.</span>
          ) : (
            <ul className="space-y-1 text-sm">
              {audit.map((a, i) => (
                <li key={i} className="flex flex-wrap items-center gap-2 text-grey-600">
                  <span className="tabular-nums">{a.at.slice(0, 16).replace("T", " ")}</span>
                  <Badge tone="neutral">{a.action}</Badge>
                  {a.actorEmail && <span className="text-ink">{a.actorEmail}</span>}
                  {a.detail && <span>· {a.detail}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      </Section>
    </div>
  );
}
