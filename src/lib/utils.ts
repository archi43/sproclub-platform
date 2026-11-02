import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * `tailwind-merge` ne connaît que les tailles de texte par défaut. Sans cette
 * déclaration, il prend `text-label` et `text-figure` (échelle du thème) pour des
 * couleurs et les supprime dès qu'une couleur suit (`text-muted`, `text-brand`) :
 * les libellés et chiffres des tuiles retombaient à la taille courante.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [{ text: ["label", "figure", "figure-lg"] }],
    },
  },
});

/** Merge Tailwind class names, resolving conflicts (last wins). */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
