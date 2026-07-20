"use client";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

/** Shared error boundary body (used by segment error.tsx files). */
export function ErrorState({ reset }: { reset: () => void }) {
  return (
    <Card className="mx-auto max-w-md text-center">
      <h2 className="text-lg font-bold text-brand">Une erreur est survenue</h2>
      <p className="mt-2 text-sm text-muted">
        Le chargement a échoué. Réessayez ; si le problème persiste, contactez la coordination.
      </p>
      <div className="mt-4 flex justify-center">
        <Button onClick={reset}>Réessayer</Button>
      </div>
    </Card>
  );
}
