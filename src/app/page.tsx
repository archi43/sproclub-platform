import { getOrgContext } from "@/lib/tenant";
import { getCurrentUser, getRolesForOrg } from "@/lib/auth";
import { homeHrefForRoles, roleLabel } from "@/lib/roles";
import { ButtonLink } from "@/components/ui/button";
import { BrandMark } from "@/components/ui/brand-mark";
import { SignOutButton } from "@/components/sign-out-button";

/**
 * Accueil — même silhouette que l'écran de connexion (direction « Poste de
 * pilotage ») : panneau navy identitaire à gauche, plan de travail clair à
 * droite. Les deux écrans vivent hors de l'app shell et se répondent donc.
 *
 * Le panneau navy ne porte **aucun élément focusable** : l'anneau de focus
 * global est en navy et y serait invisible.
 */
export default async function Home() {
  const [org, user] = await Promise.all([getOrgContext(), getCurrentUser()]);
  // Un compte connecté est renvoyé vers SON portail : envoyer tout le monde sur
  // « Mon parcours » plaçait coachs, jury, coordination et partenaires devant
  // une route que leur garde de rôle refuse.
  const roles = user && org ? await getRolesForOrg(org.id) : [];
  const home = homeHrefForRoles(roles);

  return (
    <main className="min-h-screen lg:grid lg:grid-cols-[minmax(0,42%)_1fr]">
      <aside className="flex flex-col justify-between gap-10 bg-shell px-6 py-8 sm:px-10 lg:py-12">
        <BrandMark variant="lockup" size="xl" tone="onDark" label="SproCLUB" />
        <div className="max-w-md">
          <p className="text-label font-medium uppercase text-shell-fg">Plateforme de formation</p>
          <p className="mt-3 font-heading text-2xl font-bold leading-tight tracking-tight text-shell-fg-strong sm:text-3xl">
            {org ? org.name : "Plateforme pédagogique"}
          </p>
          <p className="mt-4 text-sm leading-relaxed text-shell-fg">
            Parcours, rendez-vous, livrables et documents : un seul outil, de l&apos;inscription
            à la certification.
          </p>
        </div>
        <p className="text-label font-medium uppercase text-shell-fg">Hébergé dans l&apos;Union européenne</p>
      </aside>

      <div className="flex items-center justify-center bg-white px-6 py-12 sm:px-10">
        <div className="w-full max-w-sm">
          <h1 className="font-heading text-2xl font-bold tracking-tight text-brand sm:text-[28px]">
            {user ? "Bon retour" : "Bienvenue"}
          </h1>
          <div className="mt-3 h-[3px] w-11 rounded-full bg-accent" aria-hidden />

          {!org ? (
            <p className="mt-4 text-sm text-muted">
              Aucun organisme n&apos;est rattaché à ce domaine. Vérifiez l&apos;adresse utilisée,
              ou contactez l&apos;administrateur de la plateforme.
            </p>
          ) : !user ? (
            <>
              <p className="mt-4 text-sm text-muted">
                Espace de l&apos;organisme <strong className="font-medium text-ink">{org.name}</strong>.
                Connectez-vous pour accéder à votre portail.
              </p>
              <div className="mt-7">
                <ButtonLink href="/login" className="w-full">Se connecter</ButtonLink>
              </div>
            </>
          ) : home ? (
            <>
              <p className="mt-4 text-sm text-muted">
                Vous êtes connecté comme{" "}
                <strong className="font-medium text-ink">
                  {roles.map(roleLabel).join(", ")}
                </strong>{" "}
                chez {org.name}.
              </p>
              <div className="mt-7 flex flex-col gap-3">
                <ButtonLink href={home} className="w-full">Accéder à mon espace</ButtonLink>
                <SignOutButton className="w-full justify-center" />
              </div>
            </>
          ) : (
            <>
              <p className="mt-4 text-sm text-muted">
                Votre compte n&apos;a encore aucun rôle chez {org.name}. La coordination doit vous
                rattacher avant que vous puissiez accéder à un portail.
              </p>
              <div className="mt-7">
                <SignOutButton className="w-full justify-center" />
              </div>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
