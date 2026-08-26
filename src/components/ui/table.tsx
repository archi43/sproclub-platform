import type { HTMLAttributes, ReactNode, ThHTMLAttributes, TdHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/** Responsive table: scrolls horizontally inside its own container. */
export function Table({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-line bg-white">
      <table className={cn("w-full text-sm", className)}>{children}</table>
    </div>
  );
}

export function THead({ children }: { children: ReactNode }) {
  return <thead className="border-b border-line bg-surface text-left text-muted">{children}</thead>;
}

export function TBody({ children }: { children: ReactNode }) {
  return <tbody className="divide-y divide-line">{children}</tbody>;
}

export function Tr({ className, ...props }: HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={cn("transition-colors hover:bg-surface", className)} {...props} />;
}

/** `numeric` aligne à droite et fige la chasse des chiffres : les colonnes de
 *  pourcentages et de retards restent lisibles en colonne. */
export function Th({ scope = "col", numeric, className, ...props }: ThHTMLAttributes<HTMLTableCellElement> & { numeric?: boolean }) {
  return (
    <th
      scope={scope}
      className={cn(
        "px-4 py-3 text-label font-medium uppercase",
        numeric && "text-right",
        className
      )}
      {...props}
    />
  );
}

export function Td({ numeric, className, ...props }: TdHTMLAttributes<HTMLTableCellElement> & { numeric?: boolean }) {
  return (
    <td
      className={cn("px-4 py-3.5 align-middle", numeric && "text-right tabular-nums", className)}
      {...props}
    />
  );
}
