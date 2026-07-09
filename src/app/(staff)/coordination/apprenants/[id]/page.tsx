import type { ReactNode } from "react";
import Link from "next/link";
import { getOrgContext } from "@/lib/tenant";
import { getLearnerSheet } from "@/lib/data/admin-learners";

const pct = (v: unknown) => (typeof v === "number" ? `${Math.round(v * 100)}%` : "—");
const val = (v: unknown) => (v === null || v === undefined || v === "" ? "—" : String(v));
const bool = (v: unknown) => (v === true ? "Oui" : v === false ? "Non" : "—");

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", gap: 8 }}>
      <span style={{ color: "#777", minWidth: 190 }}>{label}</span>
      <span>{value}</span>
    </div>
  );
}
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section style={{ border: "1px solid #e5e5e5", borderRadius: 8, padding: 16, marginBottom: 16 }}>
      <h3 style={{ marginTop: 0, fontSize: 15 }}>{title}</h3>
      <div style={{ display: "grid", gap: 6 }}>{children}</div>
    </section>
  );
}

/** Module 2 / S2.2 — 360 learner sheet on real data. */
export default async function FicheApprenant({ params }: { params: { id: string } }) {
  const org = await getOrgContext();
  if (!org) return <div><p>Organisme introuvable.</p></div>;

  const sheet = await getLearnerSheet(org.id, params.id);
  if (!sheet) {
    return (
      <div className="space-y-5">
        <p><Link href="/coordination/apprenants">← Apprenants</Link></p>
        <p>Apprenant introuvable (ou hors de votre périmètre).</p>
      </div>
    );
  }

  const { learner, enrollments } = sheet;
  const name = [learner.first_name, learner.last_name].filter(Boolean).join(" ") || learner.email;

  return (
    <div className="max-w-3xl space-y-5">
      <p><Link href="/coordination/apprenants">← Apprenants</Link></p>
      <h1>{name}</h1>

      <Section title="Identité">
        <Field label="Nom" value={name} />
        <Field label="E-mail" value={learner.email} />
        <Field label="Téléphone" value={val(learner.phone)} />
        <Field label="Ville" value={val(learner.city)} />
        <Field label="Type de stagiaire" value={val(learner.trainee_type)} />
      </Section>

      {enrollments.length === 0 && <p>Aucun dossier de formation.</p>}
      {enrollments.map((e, i) => (
        <div key={String(e.id ?? i)} style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: 17 }}>Dossier — {val(e.program)}</h2>

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
    </div>
  );
}
