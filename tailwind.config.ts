import type { Config } from "tailwindcss";

/** Brand design tokens (charte SproCLUB). Single source of truth for colours,
 *  typography and spacing — no ad-hoc styles in pages.
 *  Direction: épuré / minimal (filets fins, surfaces plates, plus d'air) —
 *  mêmes couleurs de marque, application modernisée. */
export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: { DEFAULT: "#24365E", dark: "#1A2947", mid: "#8FA3C8", tint: "#EEF1F7" },
        accent: { DEFAULT: "#F74335", tint: "#FEE7E5" },
        ink: "#1A1A1A",
        // Texte secondaire (labels, descriptions) — plus doux que le navy plein.
        muted: "#5B6472",
        // Filet fin unique pour bordures/divisions (remplace les bordures grises marquées).
        line: "#E7E8EC",
        grey: { 600: "#4B4B4B", 300: "#D1D5DB" },
        // Fond de page quasi blanc : les cartes se distinguent par un filet, pas par un contraste de boîte.
        surface: "#FAFAFB",
        success: "#2E7D32",
        warning: "#B8860B",
        error: "#C0392B",
      },
      fontFamily: {
        heading: ["var(--font-heading)", "system-ui", "sans-serif"],
        body: ["var(--font-body)", "system-ui", "sans-serif"],
      },
      borderRadius: { xl: "0.75rem", "2xl": "1rem" },
    },
  },
  plugins: [],
} satisfies Config;
