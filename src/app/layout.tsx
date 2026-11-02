import type { ReactNode } from "react";
import { Cardo, Syne, Inter } from "next/font/google";
import { COLORS } from "@/lib/design-tokens";
import "./globals.css";

// Design system SproClub : Cardo (titres), Syne (interface, corps), Inter (texte
// long). `next/font` les télécharge à la compilation et les sert depuis notre
// domaine : aucun appel à Google depuis le navigateur des apprenants (RGPD).
const heading = Cardo({
  subsets: ["latin"],
  weight: ["700"],
  variable: "--font-heading",
  display: "swap",
});
const body = Syne({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-body",
  display: "swap",
});
const reading = Inter({
  subsets: ["latin"],
  weight: ["400", "600"],
  variable: "--font-reading",
  display: "swap",
});

export const metadata = {
  title: "SproCLUB Platform",
  description: "Plateforme pédagogique multi-locataire",
};

/** Mobile-first: fit the device width, allow user zoom (never disable it — a11y). */
export const viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: COLORS.shell.DEFAULT,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr" className={`${heading.variable} ${body.variable} ${reading.variable}`}>
      <body>{children}</body>
    </html>
  );
}
