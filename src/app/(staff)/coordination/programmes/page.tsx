import { getOrgContext } from "@/lib/tenant";
import { listPrograms } from "@/lib/data/programs";
import { CreateProgramForm, PublishButton } from "./program-ui";

/** Module 4 / S4.1 — programme catalogue (direction/coordinator). */
export default async function ProgrammesPage() {
  const org = await getOrgContext();
  if (!org) return <div><p>Organisme introuvable.</p></div>;

  const programs = await listPrograms(org.id);

  return (
    <div className="space-y-5">
      <h1>Catalogue des programmes</h1>

      <section style={{ margin: "16px 0 32px", padding: 16, border: "1px solid #e5e5e5", borderRadius: 8 }}>
        <h2 style={{ fontSize: 16, marginTop: 0 }}>Nouveau programme</h2>
        <CreateProgramForm />
      </section>

      <h2 style={{ fontSize: 16 }}>Programmes ({programs.length})</h2>
      {programs.length === 0 ? (
        <p>Aucun programme. Créez-en un ci-dessus.</p>
      ) : (
        <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 14 }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "2px solid #e5e5e5" }}>
              <th style={{ padding: 8 }}>Nom</th>
              <th style={{ padding: 8 }}>Spécialité</th>
              <th style={{ padding: 8 }}>Famille</th>
              <th style={{ padding: 8 }}>CPF</th>
              <th style={{ padding: 8 }}>Statut</th>
              <th style={{ padding: 8 }}>Publication</th>
            </tr>
          </thead>
          <tbody>
            {programs.map((p) => (
              <tr key={p.id} style={{ borderBottom: "1px solid #f0f0f0" }}>
                <td style={{ padding: 8 }}>{p.name}</td>
                <td style={{ padding: 8 }}>{p.specialty ?? "—"}</td>
                <td style={{ padding: 8 }}>{p.family ?? "—"}</td>
                <td style={{ padding: 8 }}>{p.cpf_eligible ? "Oui" : "Non"}</td>
                <td style={{ padding: 8, color: p.published ? "#0a7d33" : "#8a6d00" }}>
                  {p.published ? "Publié" : "Brouillon"}
                </td>
                <td style={{ padding: 8 }}>
                  <PublishButton id={p.id} published={p.published} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
