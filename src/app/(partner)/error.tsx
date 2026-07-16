"use client";

import { ErrorState } from "@/components/ui/error-state";

export default function PartnerError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorState reset={reset} />;
}
