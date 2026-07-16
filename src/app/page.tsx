import Link from "next/link";
import { getOrgContext } from "@/lib/tenant";
import { getCurrentUser } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { BrandMark } from "@/components/ui/brand-mark";
import { SignOutButton } from "@/components/sign-out-button";

export default async function Home() {
  const [org, user] = await Promise.all([getOrgContext(), getCurrentUser()]);

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center px-6 py-16">
      <div className="flex items-center gap-3">
        <BrandMark size="lg" />
        <h1 className="text-3xl font-bold text-brand">Plateforme pédagogique</h1>
      </div>

      <p className="mt-4 text-grey-600">
        {org ? (
          <>Espace de l&apos;organisme <strong className="text-ink">{org.name}</strong>.</>
        ) : (
          <>Accueil de la plateforme. Aucun organisme résolu pour ce domaine.</>
        )}
      </p>

      <div className="mt-8 flex items-center gap-3">
        {user ? (
          <>
            <Link href="/mon-parcours">
              <Button>Accéder à mon parcours</Button>
            </Link>
            <SignOutButton />
          </>
        ) : (
          <Link href="/login">
            <Button>Se connecter</Button>
          </Link>
        )}
      </div>
    </main>
  );
}
