import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function ForbiddenPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-16">
      <Card>
        <h1 className="text-xl font-bold text-brand">Accès refusé</h1>
        <p className="mt-2 text-sm text-muted">
          Votre compte n&apos;a pas les droits nécessaires pour accéder à cet espace.
        </p>
        <div className="mt-4">
          <ButtonLink variant="secondary" href="/login">
            Se connecter avec un autre compte
          </ButtonLink>
        </div>
      </Card>
    </main>
  );
}
