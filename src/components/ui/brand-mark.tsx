import { cn } from "@/lib/utils";

type Tone = "onLight" | "onDark";
type Size = "sm" | "md" | "lg";

const tones: Record<Tone, string> = {
  onLight: "bg-brand text-white",
  onDark: "bg-white text-brand",
};
const sizes: Record<Size, string> = {
  sm: "h-7 w-7 rounded-md text-xs",
  md: "h-9 w-9 rounded-lg text-sm",
  lg: "h-10 w-10 rounded-lg text-sm",
};

/** "SC" brand mark (charte SproCLUB). `onDark` inverts it for navy surfaces. */
export function BrandMark({ tone = "onLight", size = "sm", className }: { tone?: Tone; size?: Size; className?: string }) {
  return (
    <span aria-hidden className={cn("grid place-items-center font-bold", tones[tone], sizes[size], className)}>
      SC
    </span>
  );
}
