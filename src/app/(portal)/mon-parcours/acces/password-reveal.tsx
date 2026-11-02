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

type Timer = ReturnType<typeof setTimeout>;

/**
 * Affichage du mot de passe à la demande (INC-30).
 *
 * Le secret n'est jamais rendu par le serveur dans la page : il n'arrive qu'à
 * la demande explicite, ne vit que dans l'état du composant, et disparaît au
 * masquage, au délai d'inactivité ou au départ de la page.
 *
 * Clavier et lecteur d'écran : le bouton cliqué disparaissant, le focus est
 * déplacé sur le mot de passe affiché, puis ramené sur « Afficher » au masquage ;
 * chaque changement d'état est annoncé dans la zone `aria-live`.
 */
export function PasswordReveal({ assignmentId, label }: { assignmentId: string; label: string }) {
  const [password, setPassword] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const [pending, startTransition] = useTransition();
  const hideTimer = useRef<Timer | null>(null);
  const copiedTimer = useRef<Timer | null>(null);
  const secretRef = useRef<HTMLElement | null>(null);
  const revealRef = useRef<HTMLButtonElement | null>(null);
  const restoreFocus = useRef(false);

  useEffect(() => () => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
  }, []);

  useEffect(() => {
    if (password) secretRef.current?.focus();
    else if (restoreFocus.current) {
      restoreFocus.current = false;
      revealRef.current?.focus();
    }
  }, [password]);

  const hide = (reason: string) => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    restoreFocus.current = true;
    setPassword(null);
    setCopied(false);
    setAnnouncement(reason);
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
      setAnnouncement("Mot de passe affiché. Il sera masqué automatiquement dans deux minutes.");
      if (hideTimer.current) clearTimeout(hideTimer.current);
      hideTimer.current = setTimeout(() => hide("Mot de passe masqué automatiquement."), AUTO_HIDE_MS);
    });
  };

  const copy = async () => {
    if (!password) return;
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
      setAnnouncement("Mot de passe copié dans le presse-papiers.");
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
      copiedTimer.current = setTimeout(() => setCopied(false), COPIED_FEEDBACK_MS);
    } catch {
      setError("La copie a échoué : sélectionnez le mot de passe et copiez-le à la main.");
    }
  };

  const hintId = `pwd-hint-${assignmentId}`;

  return (
    <div className="space-y-2">
      {password ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="sr-only">{`Mot de passe de l'accès ${label} :`}</span>
          <code
            ref={secretRef}
            tabIndex={-1}
            className="select-all rounded-md bg-surface px-3 py-1.5 font-mono text-sm text-ink ring-1 ring-inset ring-line focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            {password}
          </code>
          <Button size="sm" variant="secondary" onClick={copy}>
            {copied ? <Check aria-hidden className="h-4 w-4" /> : <Copy aria-hidden className="h-4 w-4" />}
            {copied ? "Copié" : "Copier"}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => hide("Mot de passe masqué.")}>
            <EyeOff aria-hidden className="h-4 w-4" />
            Masquer
          </Button>
        </div>
      ) : (
        <Button ref={revealRef} size="sm" variant="secondary" onClick={reveal} disabled={pending} aria-describedby={hintId}>
          <Eye aria-hidden className="h-4 w-4" />
          {pending ? "Récupération…" : "Afficher le mot de passe"}
        </Button>
      )}
      <p id={hintId} className="text-xs text-muted">
        {password
          ? "Masqué automatiquement après deux minutes."
          : "Chaque demande est enregistrée dans votre dossier."}
      </p>
      <p aria-live="polite" className="sr-only">{announcement}</p>
      {error && <Alert tone="error">{error}</Alert>}
    </div>
  );
}
