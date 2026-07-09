import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type Tone = "info" | "success" | "error";

const tones: Record<Tone, string> = {
  info: "bg-brand-tint text-brand",
  success: "bg-success/10 text-success",
  error: "bg-accent-tint text-error",
};

/** Inline status/alert message. Not for small body text on white (charte). */
export function Alert({ tone = "info", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <div role="status" className={cn("rounded-lg px-3 py-2 text-sm", tones[tone], className)}>
      {children}
    </div>
  );
}
