import type { ReactNode } from "react";
import Link from "next/link";
import { getOrgContext } from "@/lib/tenant";
import { getLearnerSheet } from "@/lib/data/admin-learners";
import { listReportsForLearner } from "@/lib/data/coaching";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

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
    </div>
  );
}
