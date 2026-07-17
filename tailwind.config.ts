import type { Config } from "tailwindcss";

/** Brand design tokens (charte SproCLUB). Single source of truth for colours,
 *  typography and spacing — no ad-hoc styles in pages. */
export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: { DEFAULT: "#24365E", dark: "#1A2947", mid: "#8FA3C8", tint: "#E9EDF5" },
        accent: { DEFAULT: "#F74335", tint: "#FEE7E5" },
        ink: "#1A1A1A",
        grey: { 600: "#4B4B4B", 300: "#D1D5DB" },
        surface: "#F7F8FA",
        success: "#2E7D32",
        warning: "#B8860B",
        error: "#C0392B",
      },
      fontFamily: {
        heading: ["var(--font-heading)", "system-ui", "sans-serif"],
        body: ["var(--font-body)", "system-ui", "sans-serif"],
      },
      borderRadius: { xl: "0.75rem" },
    },
  },
  plugins: [],
} satisfies Config;
