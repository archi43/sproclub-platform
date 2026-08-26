import type { Config } from "tailwindcss";
import { COLORS } from "./src/lib/design-tokens";

/** Thème Tailwind. Les couleurs viennent de `src/lib/design-tokens.ts`, seule
 *  source de vérité : le même objet est audité par `tests/contrast.unit.test.mts`,
 *  donc toute classe générée ici est couverte par la preuve de contraste AA.
 *
 *  Direction : « Poste de pilotage » — le navy porte la coque des rôles qui
 *  opèrent, le contenu garde des surfaces plates et des filets fins, avec les
 *  écarts d'échelle typographiques qui rendent les chiffres lisibles d'un coup
 *  d'œil. Le rouge est un signal, jamais un décor. */
export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: COLORS,
      fontFamily: {
        heading: ["var(--font-heading)", "system-ui", "sans-serif"],
        body: ["var(--font-body)", "system-ui", "sans-serif"],
      },
      borderRadius: { xl: "0.75rem", "2xl": "1rem" },
      fontSize: {
        // Échelle des libellés en petites capitales espacées (reprise de la
        // direction « Registre ») : rend la hiérarchie sans ajouter de boîtes.
        label: ["0.6875rem", { lineHeight: "1rem", letterSpacing: "0.14em" }],
        // Chiffres de synthèse : leur taille EST la hiérarchie.
        figure: ["1.75rem", { lineHeight: "1.1", letterSpacing: "-0.03em" }],
        "figure-lg": ["2.5rem", { lineHeight: "1", letterSpacing: "-0.035em" }],
      },
    },
  },
  plugins: [],
} satisfies Config;
