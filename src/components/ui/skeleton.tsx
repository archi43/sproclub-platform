import { cn } from "@/lib/utils";

/** Loading placeholder block. */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-grey-300/50", className)} />;
}

/** A few stacked skeleton lines for list/table loading states. */
export function SkeletonList({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-3" aria-hidden>
      <Skeleton className="h-8 w-48" />
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-12 w-full" />
      ))}
    </div>
  );
}
