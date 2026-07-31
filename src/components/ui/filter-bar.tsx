import type { ReactNode } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Barre de filtres réutilisable (direction épurée). Rendu serveur : un simple
 * `<form method="get">` qui écrit les filtres dans les `searchParams` — pas de
 * JS client. Chaque écran-liste passe ses champs (`FilterField`/`FilterCheckbox`)
 * en enfants. `active` affiche le lien « Réinitialiser » quand un filtre est posé.
 * Aucune marge extérieure par défaut : l'écran gère son rythme vertical
 * (`space-y-*` du conteneur, ou `className="mb-6"` s'il n'en a pas).
 */
export function FilterBar({ resetHref, active = false, className, children }: {
  resetHref: string;
  active?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <form
      method="get"
      className={cn("flex flex-wrap items-end gap-3 rounded-xl border border-line bg-white p-3", className)}
    >
      {children}
      <div className="flex items-center gap-2">
        <Button type="submit" size="sm">Filtrer</Button>
        {active && (
          <ButtonLink href={resetHref} variant="ghost" size="sm">Réinitialiser</ButtonLink>
        )}
      </div>
    </form>
  );
}

/** Champ de filtre : libellé au-dessus du contrôle (Select/Input passé en enfant). */
export function FilterField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex min-w-40 flex-col gap-1">
      <span className="text-xs font-medium text-muted">{label}</span>
      {children}
    </label>
  );
}

/** Champ de recherche libre (nom, e-mail). Même rendu serveur que le reste. */
export function FilterSearch({ name = "q", label = "Rechercher", placeholder, defaultValue }: {
  name?: string;
  label?: string;
  placeholder?: string;
  defaultValue?: string;
}) {
  return (
    <label className="flex min-w-56 flex-col gap-1">
      <span className="text-xs font-medium text-muted">{label}</span>
      <input
        type="search"
        name={name}
        defaultValue={defaultValue}
        placeholder={placeholder}
        className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-muted/50 transition-colors focus-visible:border-brand"
      />
    </label>
  );
}

/** Filtre booléen inline (case à cocher), aligné sur la hauteur des Selects. */
export function FilterCheckbox({ name, label, defaultChecked }: {
  name: string;
  label: string;
  defaultChecked?: boolean;
}) {
  return (
    <label className="flex h-9 items-center gap-2 text-sm text-ink">
      <input type="checkbox" name={name} value="1" defaultChecked={defaultChecked} className="accent-brand" />
      {label}
    </label>
  );
}
