"use client";

import { ErrorState } from "@/components/ui/error-state";

export default function StaffError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorState reset={reset} />;
}
