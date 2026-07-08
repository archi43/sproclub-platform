import { getOrgContext } from "@/lib/tenant";
import { getCurrentUser } from "@/lib/auth";
import { SignOutButton } from "@/components/sign-out-button";

export default async function Home() {
  const [org, user] = await Promise.all([getOrgContext(), getCurrentUser()]);

  return (
    <main style={{ padding: 32, fontFamily: "system-ui" }}>
      <h1>Plateforme pédagogique</h1>
      {org ? (
        <p>
          Espace de l'organisme : <strong>{org.name}</strong>
        </p>
      ) : (
        <p>Accueil de la plateforme. Aucun organisme résolu pour ce domaine.</p>
      )}

      {user ? (
        <div style={{ display: "flex", gap: 16, alignItems: "center", marginTop: 16 }}>
          <a href="/mon-parcours">Accéder à mon parcours</a>
          <SignOutButton />
        </div>
      ) : (
        <p style={{ marginTop: 16 }}>
          <a href="/login">Se connecter</a>
        </p>
      )}
    </main>
  );
}
