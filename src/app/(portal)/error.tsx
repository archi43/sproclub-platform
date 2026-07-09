"use client";

import { ErrorState } from "@/components/ui/error-state";

export default function PortalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorState reset={reset} />;
}
