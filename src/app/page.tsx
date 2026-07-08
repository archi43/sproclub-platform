import { getOrgContext } from "@/lib/tenant";

export default async function Home() {
  const org = await getOrgContext();
  return (
    <main style={{ padding: 32, fontFamily: "system-ui" }}>
      <h1>Plateforme pédagogique</h1>
      {org ? (
        <p>Espace de l'organisme : <strong>{org.name}</strong></p>
      ) : (
        <p>Accueil de la plateforme. Aucun organisme résolu pour ce domaine.</p>
      )}
    </main>
  );
}
