import type { ReactNode } from "react";

export const metadata = {
  title: "SproCLUB Platform",
  description: "Plateforme pédagogique multi-locataire",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
