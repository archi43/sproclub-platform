export default function ForbiddenPage() {
  return (
    <main style={{ maxWidth: 480, margin: "10vh auto", padding: 24, fontFamily: "system-ui" }}>
      <h1>Accès refusé</h1>
      <p>Votre compte n'a pas les droits nécessaires pour accéder à cet espace.</p>
      <p>
        <a href="/login">Se connecter avec un autre compte</a>
      </p>
    </main>
  );
}
