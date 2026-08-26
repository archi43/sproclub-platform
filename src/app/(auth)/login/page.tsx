"use client";

import type { ReactNode } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { requestLoginCode, verifyLoginCode, type LoginState } from "./actions";
import { Button } from "@/components/ui/button";
import { BrandMark } from "@/components/ui/brand-mark";
import { Field, Input } from "@/components/ui/form";
import { Alert } from "@/components/ui/alert";

/**
 * Écran de connexion — direction « Poste de pilotage » appliquée hors app shell.
 *
 * L'écran vit dans son propre groupe de routes : il n'hérite donc d'aucune coque.
 * Il la reconstitue en deux panneaux — navy à gauche (identité + ce que l'accès
 * ouvre), plan de travail clair à droite (le formulaire) — ce qui donne à la
 * première impression la même silhouette que le reste de la plateforme.
 *
 * Le panneau navy ne contient **aucun élément focusable** : l'anneau de focus
 * global est en navy (`globals.css`), il serait invisible sur ce fond.
 */

const initialState: LoginState = { ok: false, message: "" };

function SubmitButton({ pendingLabel, children }: { pendingLabel: string; children: ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending ? pendingLabel : children}
    </Button>
  );
}

/** Fait rassurant affiché sous la marque. Purement informatif, non focusable. */
function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="text-label font-medium uppercase text-shell-fg">{label}</p>
      <p className="mt-1 text-sm text-shell-fg-strong">{children}</p>
    </div>
  );
}

export default function LoginPage() {
  const [requestState, requestAction] = useFormState(requestLoginCode, initialState);
  const [verifyState, verifyAction] = useFormState(verifyLoginCode, initialState);
  const sentTo = requestState.ok ? requestState.email : undefined;

  return (
    <main className="min-h-screen lg:grid lg:grid-cols-[minmax(0,42%)_1fr]">
      {/* Panneau d'identité — bande compacte sur mobile, colonne pleine sur desktop */}
      <aside className="flex flex-col justify-between gap-10 bg-shell px-6 py-8 sm:px-10 lg:py-12">
        <div className="flex items-center gap-3">
          <BrandMark size="md" tone="onDark" />
          <span className="font-heading text-sm font-semibold text-shell-fg-strong">SproCLUB</span>
        </div>

        <div className="max-w-md">
          <p className="text-label font-medium uppercase text-shell-fg">Plateforme de formation</p>
          <p className="mt-3 font-heading text-2xl font-bold leading-tight tracking-tight text-shell-fg-strong sm:text-3xl">
            Votre espace SproCLUB
          </p>
          <p className="mt-4 text-sm leading-relaxed text-shell-fg">
            Apprenants, coachs, jury et entreprises partenaires accèdent au même endroit à leurs
            parcours, leurs rendez-vous et leurs documents.
          </p>
        </div>

        <div className="grid gap-6 sm:grid-cols-2">
          <Fact label="Sans mot de passe">Un code à usage unique, valable quelques minutes.</Fact>
          <Fact label="Hébergement">Union européenne, conforme au RGPD.</Fact>
        </div>
      </aside>

      {/* Plan de travail — le formulaire, posé à plat, sans boîte */}
      <div className="flex items-center justify-center bg-white px-6 py-12 sm:px-10">
        <div className="w-full max-w-sm">
          <h1 className="font-heading text-2xl font-bold tracking-tight text-brand sm:text-[28px]">
            Connexion
          </h1>
          <div className="mt-3 h-[3px] w-11 rounded-full bg-accent" aria-hidden />
          <p className="mt-4 text-sm text-muted">
            Saisissez votre adresse e-mail : vous recevrez un code de connexion à 6 chiffres.
          </p>

          <form action={requestAction} className="mt-7 space-y-4">
            <Field label="Adresse e-mail" htmlFor="email">
              <Input id="email" name="email" type="email" required autoComplete="email" placeholder="vous@exemple.fr" />
            </Field>
            <SubmitButton pendingLabel="Envoi…">
              {sentTo ? "Renvoyer un code" : "Recevoir un code de connexion"}
            </SubmitButton>
          </form>

          {requestState.message && (
            <div className="mt-4">
              <Alert tone={requestState.ok ? "success" : "error"}>{requestState.message}</Alert>
            </div>
          )}

          {sentTo && (
            <form action={verifyAction} className="mt-7 space-y-4 border-t border-line pt-6">
              <input type="hidden" name="email" value={sentTo} />
              <Field label={`Code reçu à ${sentTo}`} htmlFor="code">
                <Input
                  id="code"
                  name="code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={9}
                  required
                  placeholder="123456"
                  className="text-center font-heading text-lg font-semibold tracking-[0.35em] tabular-nums"
                />
              </Field>
              <SubmitButton pendingLabel="Vérification…">Se connecter</SubmitButton>
              {verifyState.message && <Alert tone="error">{verifyState.message}</Alert>}
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
