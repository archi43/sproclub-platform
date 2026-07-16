"use client";

import { useFormState, useFormStatus } from "react-dom";
import { requestMagicLink, type LoginState } from "./actions";
import { Button } from "@/components/ui/button";
import { BrandMark } from "@/components/ui/brand-mark";
import { Card } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/form";
import { Alert } from "@/components/ui/alert";

const initialState: LoginState = { ok: false, message: "" };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending ? "Envoi…" : "Recevoir un lien de connexion"}
    </Button>
  );
}

export default function LoginPage() {
  const [state, formAction] = useFormState(requestMagicLink, initialState);

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-16">
      <div className="mb-6 flex items-center gap-3">
        <BrandMark size="md" />
        <h1 className="text-2xl font-bold text-brand">Connexion</h1>
      </div>

      <Card>
        <p className="mb-4 text-sm text-grey-600">
          Saisissez votre adresse e-mail : vous recevrez un lien de connexion sécurisé.
        </p>
        <form action={formAction} className="space-y-4">
          <Field label="Adresse e-mail" htmlFor="email">
            <Input id="email" name="email" type="email" required autoComplete="email" placeholder="vous@exemple.fr" />
          </Field>
          <SubmitButton />
        </form>
        {state.message && (
          <div className="mt-4">
            <Alert tone={state.ok ? "success" : "error"}>{state.message}</Alert>
          </div>
        )}
      </Card>
    </main>
  );
}
