"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Eye, EyeOff, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { revealPasswordAction } from "./actions";

/** Le mot de passe se masque seul : un écran partagé en visio ou laissé ouvert
 *  ne doit pas l'exposer indéfiniment. */
const AUTO_HIDE_MS = 2 * 60 * 1000;
const COPIED_FEEDBACK_MS = 2000;

/**
 * Affichage du mot de passe à la demande (INC-30).
 *
 * Le secret n'est jamais rendu par le serveur dans la page : il n'arrive qu'à
 * la demande explicite, ne vit que dans l'état du composant, et disparaît au
 * masquage, au délai d'inactivité ou au départ de la page.
 */
export function PasswordReveal({ assignmentId, label }: { assignmentId: string; label: string }) {
  const [password, setPassword] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (hideTimer.current) clearTimeout(hideTimer.current); }, []);

  const hide = () => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    setPassword(null);
    setCopied(false);
  };

  const reveal = () => {
    setError(null);
    startTransition(async () => {
      const result = await revealPasswordAction(assignmentId);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setPassword(result.password);
      if (hideTimer.current) clearTimeout(hideTimer.current);
      hideTimer.current = setTimeout(hide, AUTO_HIDE_MS);
    });
  };

  const copy = async () => {
    if (!password) return;
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
      setTimeout(() => setCopied(false), COPIED_FEEDBACK_MS);
    } catch {
      setError("La copie a échoué : sélectionnez le mot de passe et copiez-le à la main.");
    }
  };

  return (
    <div className="space-y-2">
      {password ? (
        <div className="flex flex-wrap items-center gap-2">
          <code
            className="rounded-md bg-surface px-3 py-1.5 font-mono text-sm text-ink ring-1 ring-inset ring-line select-all"
            aria-label={`Mot de passe de l'accès ${label}`}
          >
            {password}
          </code>
          <Button size="sm" variant="secondary" onClick={copy}>
            {copied ? <Check aria-hidden className="h-4 w-4" /> : <Copy aria-hidden className="h-4 w-4" />}
            {copied ? "Copié" : "Copier"}
          </Button>
          <Button size="sm" variant="ghost" onClick={hide}>
            <EyeOff aria-hidden className="h-4 w-4" />
            Masquer
          </Button>
        </div>
      ) : (
        <Button size="sm" variant="secondary" onClick={reveal} disabled={pending} aria-describedby={`pwd-hint-${assignmentId}`}>
          <Eye aria-hidden className="h-4 w-4" />
          {pending ? "Récupération…" : "Afficher le mot de passe"}
        </Button>
      )}
      <p id={`pwd-hint-${assignmentId}`} className="text-xs text-muted">
        {password
          ? "Masqué automatiquement après deux minutes."
          : "Chaque affichage est enregistré dans votre dossier."}
      </p>
      <div aria-live="polite">
        {copied && <span className="sr-only">Mot de passe copié dans le presse-papiers.</span>}
        {error && <Alert tone="error">{error}</Alert>}
      </div>
    </div>
  );
}
