import Image from "next/image";
import { cn } from "@/lib/utils";

type Tone = "onLight" | "onDark";
type Size = "sm" | "md" | "lg" | "xl";

/**
 * Logo SproCLUB — écu `pro/club` (charte).
 *
 * Deux déclinaisons, deux tons. Les fichiers sont des PNG détourés générés
 * depuis le logo source fourni par la direction (1182 px, canal alpha propre),
 * donc **jamais recolorés en CSS** : chaque ton a son propre fichier, ce qui
 * évite un aplat plein si un masque CSS échouait.
 *
 * - `shield` : l'écu seul, pour les en-têtes et le rail de navigation, où il
 *   côtoie déjà le nom de l'organisme en texte.
 * - `lockup` : écu + mot-symbole, quand le logo doit porter l'identité seul
 *   (écran de connexion, documents générés).
 *
 * Le logo est **décoratif** : il accompagne toujours le nom en texte, donc
 * `alt=""` et `aria-hidden`. Là où il porte seul l'identité, passer un `alt`
 * explicite via `label`.
 */

// Rapports mesurés sur les fichiers détourés (voir CLAUDE.md pour leur origine).
const SHIELD_RATIO = 364 / 472;
const LOCKUP_RATIO = 554 / 650;

// L'écu est un logo au trait fin : sous ~32 px le filet devient ténu. Les
// tailles du rail ont été relevées en conséquence, après contrôle visuel.
const HEIGHTS: Record<Size, number> = { sm: 32, md: 40, lg: 48, xl: 104 };

export function BrandMark({
  tone = "onLight",
  size = "sm",
  variant = "shield",
  label,
  className,
}: {
  tone?: Tone;
  size?: Size;
  variant?: "shield" | "lockup";
  /** Texte alternatif quand le logo porte seul l'identité. Sinon décoratif. */
  label?: string;
  className?: string;
}) {
  const height = HEIGHTS[size];
  const ratio = variant === "shield" ? SHIELD_RATIO : LOCKUP_RATIO;
  const width = Math.round(height * ratio);
  const file = `/brand/proclub-${variant}-${tone === "onDark" ? "white" : "navy"}.png`;

  return (
    <Image
      src={file}
      alt={label ?? ""}
      aria-hidden={label ? undefined : true}
      width={width}
      height={height}
      priority
      className={cn("shrink-0 object-contain", className)}
    />
  );
}
