"use client";

import { useFormState, useFormStatus } from "react-dom";
import { generateDocumentAction, type DocState } from "./document-actions";
import { Button } from "@/components/ui/button";
import { DOCUMENT_LABELS, DOCUMENT_KINDS } from "@/lib/documents/content";

const initial: DocState = { ok: false, message: "" };

function GenButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" variant="secondary" disabled={pending}>
      {pending ? "Génération…" : label}
    </Button>
  );
}

/** One generate button per document kind, plus the last action's feedback. */
export function GenerateDocuments({ enrollmentId, learnerId }: { enrollmentId: string; learnerId: string }) {
  const [state, action] = useFormState(generateDocumentAction, initial);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {DOCUMENT_KINDS.map((kind) => (
          <form key={kind} action={action}>
            <input type="hidden" name="enrollmentId" value={enrollmentId} />
            <input type="hidden" name="learnerId" value={learnerId} />
            <input type="hidden" name="kind" value={kind} />
            <GenButton label={DOCUMENT_LABELS[kind]} />
          </form>
        ))}
      </div>
      {state.message && (
        <p role="status" className={state.ok ? "text-sm text-success" : "text-sm text-error"}>{state.message}</p>
      )}
    </div>
  );
}
