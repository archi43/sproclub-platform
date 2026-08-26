import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type Tone = "info" | "success" | "warning" | "error";

/** Paires auditées AA (voir `CHARTE_TEXT_PAIRS`). Le jaune et le vert passent
 *  par leur variante foncée : sur leur propre teinte, la version pleine échoue. */
const tones: Record<Tone, string> = {
  info: "bg-brand-tint text-brand",
  success: "bg-success-tint text-success-ink",
  warning: "bg-warning-tint text-warning-ink",
  error: "bg-error-tint text-error",
};

/** Inline status/alert message. Not for small body text on white (charte). */
export function Alert({ tone = "info", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <div role="status" className={cn("rounded-lg px-3 py-2 text-sm", tones[tone], className)}>
      {children}
    </div>
  );
}
