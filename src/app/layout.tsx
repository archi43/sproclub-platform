import type { ReactNode } from "react";
import { Montserrat, Hind_Madurai } from "next/font/google";
import "./globals.css";

const heading = Montserrat({
  subsets: ["latin"],
  weight: ["600", "700"],
  variable: "--font-heading",
  display: "swap",
});
const body = Hind_Madurai({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-body",
  display: "swap",
});

export const metadata = {
  title: "SproCLUB Platform",
  description: "Plateforme pédagogique multi-locataire",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr" className={`${heading.variable} ${body.variable}`}>
      <body>{children}</body>
    </html>
  );
}
