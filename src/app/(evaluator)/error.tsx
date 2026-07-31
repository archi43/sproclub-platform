"use client";

import { ErrorState } from "@/components/ui/error-state";

export default function EvaluatorError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorState reset={reset} />;
}
