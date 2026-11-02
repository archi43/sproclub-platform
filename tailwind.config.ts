import type { Config } from "tailwindcss";
import { COLORS, SHADOWS } from "./src/lib/design-tokens";

/** Thème Tailwind, aligné sur le design system SproClub. Les couleurs viennent de
 *  `src/lib/design-tokens.ts`, seule source de vérité : le même objet est audité
 *  par `tests/contrast.unit.test.mts`, donc toute classe générée ici est couverte
 *  par la preuve de contraste AA.
 *
 *  Typographie : Cardo pour les titres, Syne pour l'interface et le corps, Inter
 *  pour le texte long. Rayons : 6 px pour les boutons, champs et cards, 4 px pour
 *  les étiquettes, 8 px pour les grands conteneurs ; pas de gélule. Le terracotta
 *  est un signal, jamais un décor. */
export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: COLORS,
      fontFamily: {
        // Replis imposés par le design system, jamais improvisés.
        heading: ["var(--font-heading)", "Georgia", "Times New Roman", "serif"],
        body: ["var(--font-body)", "Helvetica Neue", "Arial", "sans-serif"],
        reading: ["var(--font-reading)", "-apple-system", "Segoe UI", "Roboto", "Arial", "sans-serif"],
      },
      borderRadius: { DEFAULT: "4px", md: "6px", lg: "6px", xl: "6px", "2xl": "8px" },
      boxShadow: { card: SHADOWS.card },
      fontSize: {
        // Libellés en capitales (variante outil de l'« eyebrow » du design
        // system) : rendent la hiérarchie sans ajouter de boîtes.
        label: ["0.75rem", { lineHeight: "1rem", letterSpacing: "0.06em" }],
        // Chiffres de synthèse, en Cardo (rôle « Stat » du design system) : leur
        // taille EST la hiérarchie. `figure-lg` reprend la valeur web : 42/47 px.
        figure: ["1.75rem", { lineHeight: "1.1", letterSpacing: "-0.01em" }],
        "figure-lg": ["2.625rem", { lineHeight: "47px", letterSpacing: "-0.3px" }],
      },
    },
  },
  plugins: [],
} satisfies Config;
