import type { ReactNode } from "react";

/**
 * En-tête d'écran. L'échelle typographique vient de la direction « Registre » :
 * le titre porte la hiérarchie, un filet accent le souligne, et le libellé de
 * contexte est en petites capitales espacées. Aucune boîte.
 */
export function PageHeader({ title, description, eyebrow, actions }: {
  title: string;
  description?: string;
  eyebrow?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow && (
          <p className="mb-2 text-label font-medium uppercase text-muted">{eyebrow}</p>
        )}
        <h1 className="font-heading text-2xl font-bold tracking-tight text-brand sm:text-[28px] sm:leading-tight">
          {title}
        </h1>
        <div className="mt-3 h-[3px] w-11 rounded-full bg-accent" aria-hidden />
        {description && <p className="mt-3 text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-line bg-white px-6 py-14 text-center">
      <p className="font-heading font-semibold text-ink">{title}</p>
      {description && <p className="mx-auto mt-1 max-w-md text-sm text-muted">{description}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}
