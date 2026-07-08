"use client";

import { useFormState, useFormStatus } from "react-dom";
import { requestMagicLink, type LoginState } from "./actions";

const initialState: LoginState = { ok: false, message: "" };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} style={{ padding: "10px 16px", fontSize: 16 }}>
      {pending ? "Envoi…" : "Recevoir un lien de connexion"}
    </button>
  );
}

export default function LoginPage() {
  const [state, formAction] = useFormState(requestMagicLink, initialState);

  return (
    <main style={{ maxWidth: 420, margin: "10vh auto", padding: 24, fontFamily: "system-ui" }}>
      <h1>Connexion</h1>
      <p style={{ color: "#555" }}>
        Saisissez votre adresse e-mail : vous recevrez un lien de connexion sécurisé.
      </p>
      <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 16 }}>
        <label htmlFor="email">Adresse e-mail</label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="vous@exemple.fr"
          style={{ padding: 10, fontSize: 16 }}
        />
        <SubmitButton />
      </form>
      {state.message && (
        <p role="status" style={{ marginTop: 16, color: state.ok ? "#0a7d33" : "#b00020" }}>
          {state.message}
        </p>
      )}
    </main>
  );
}
