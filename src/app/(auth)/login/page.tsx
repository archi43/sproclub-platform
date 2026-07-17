"use client";

import type { ReactNode } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { requestLoginCode, verifyLoginCode, type LoginState } from "./actions";
import { Button } from "@/components/ui/button";
import { BrandMark } from "@/components/ui/brand-mark";
import { Card } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/form";
import { Alert } from "@/components/ui/alert";

const initialState: LoginState = { ok: false, message: "" };

function SubmitButton({ pendingLabel, children }: { pendingLabel: string; children: ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending ? pendingLabel : children}
    </Button>
  );
}

export default function LoginPage() {
  const [requestState, requestAction] = useFormState(requestLoginCode, initialState);
  const [verifyState, verifyAction] = useFormState(verifyLoginCode, initialState);
  const sentTo = requestState.ok ? requestState.email : undefined;

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-16">
      <div className="mb-6 flex items-center gap-3">
        <BrandMark size="md" />
        <h1 className="text-2xl font-bold text-brand">Connexion</h1>
      </div>

      <Card>
        <p className="mb-4 text-sm text-grey-600">
          Saisissez votre adresse e-mail : vous recevrez un code de connexion à 6 chiffres.
        </p>
        <form action={requestAction} className="space-y-4">
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
          <form action={verifyAction} className="mt-6 space-y-4 border-t border-grey-300/60 pt-5">
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
                className="text-center font-heading text-lg tracking-widest"
              />
            </Field>
            <SubmitButton pendingLabel="Vérification…">Se connecter</SubmitButton>
            {verifyState.message && <Alert tone="error">{verifyState.message}</Alert>}
          </form>
        )}
      </Card>
    </main>
  );
}
