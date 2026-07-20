import type { ButtonHTMLAttributes, ComponentProps } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

type Variant = "primary" | "accent" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 rounded-lg text-sm font-medium transition-colors no-underline hover:no-underline " +
  "disabled:pointer-events-none disabled:opacity-50";

const variants: Record<Variant, string> = {
  primary: "bg-brand text-white hover:bg-brand-dark",
  accent: "bg-accent text-white hover:brightness-95",
  secondary: "bg-white text-ink border border-line hover:bg-surface",
  ghost: "text-brand hover:bg-brand-tint",
  danger: "bg-error text-white hover:brightness-95",
};
const sizes: Record<Size, string> = {
  sm: "h-8 px-3",
  md: "h-9 px-3.5",
  lg: "h-10 px-4",
};

export interface ButtonStyleProps {
  variant?: Variant;
  size?: Size;
  className?: string;
}

/** Shared button look — also for link-shaped controls (plain <a> for file downloads). */
export function buttonClasses({ variant = "primary", size = "md", className }: ButtonStyleProps = {}) {
  return cn(base, variants[variant], sizes[size], className);
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

export function Button({ className, variant = "primary", size = "md", type = "button", ...props }: ButtonProps) {
  return <button type={type} className={buttonClasses({ variant, size, className })} {...props} />;
}

export type ButtonLinkProps = ComponentProps<typeof Link> & { variant?: Variant; size?: Size };

/** Navigation link with button appearance — never nest a <button> inside a link. */
export function ButtonLink({ className, variant = "primary", size = "md", ...props }: ButtonLinkProps) {
  return <Link {...props} className={buttonClasses({ variant, size, className })} />;
}
