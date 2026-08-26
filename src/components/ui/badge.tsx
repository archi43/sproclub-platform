import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type Tone = "neutral" | "brand" | "success" | "warning" | "danger";

/** Chaque paire figure dans `CHARTE_TEXT_PAIRS` : le contraste AA est prouvé
 *  par `tests/contrast.unit.test.mts`, pas seulement supposé. */
const tones: Record<Tone, string> = {
  neutral: "bg-surface text-muted ring-1 ring-inset ring-line",
  brand: "bg-brand-tint text-brand",
  success: "bg-success-tint text-success-ink",
  warning: "bg-warning-tint text-warning-ink",
  danger: "bg-error-tint text-error",
};

export function Badge({ tone = "neutral", className, ...props }: HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", tones[tone], className)}
      {...props}
    />
  );
}
