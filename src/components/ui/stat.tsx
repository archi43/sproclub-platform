import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type Tone = "neutral" | "critical";

const tones: Record<Tone, { box: string; value: string; label: string }> = {
  neutral: { box: "border-line bg-white", value: "text-brand", label: "text-muted" },
  // Le rouge signale, il ne décore pas : la tuile critique change de fond ET de
  // couleur de chiffre, l'état n'est donc jamais porté par la seule couleur.
  critical: { box: "border-accent-tint bg-error-tint", value: "text-error", label: "text-error" },
};

/**
 * Tuile de synthèse : le chiffre EST la hiérarchie (direction « Registre »),
 * posé dans la bande de pilotage en haut d'un écran-liste.
 * Les chiffres sont en `tabular-nums` pour rester alignés d'une tuile à l'autre.
 */
export function StatTile({ label, value, hint, tone = "neutral" }: {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: Tone;
}) {
  const t = tones[tone];
  return (
    <div className={cn("rounded-xl border p-4", t.box)}>
      <p className={cn("text-label font-medium uppercase", t.label)}>{label}</p>
      <p className={cn("mt-2 font-heading text-figure font-bold tabular-nums", t.value)}>{value}</p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

/** Bande de tuiles, responsive : 2 colonnes sur mobile, 4 à partir de `sm`. */
export function StatGrid({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("grid grid-cols-2 gap-3 sm:grid-cols-4", className)}>{children}</div>;
}
