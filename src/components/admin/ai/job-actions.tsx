"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { MAX_JOB_ATTEMPTS_CLIENT } from "@/components/admin/ai/constants";

/**
 * Retry and cancel for one job row (spec §19).
 *
 * A client island inside a server-rendered table: only these two buttons need
 * JavaScript, so the rest of the job list ships none.
 *
 * Both actions refresh the route rather than mutating a local copy of the row —
 * a retry changes the job's status, its attempt count *and* the content record's
 * status, and reproducing that in client state would be three chances to drift
 * from what the server actually did.
 */
export function JobActions({
  jobId,
  status,
  attempts,
  reference,
}: {
  jobId: string;
  status: string;
  attempts: number;
  reference: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const act = async (action: "retry" | "cancel") => {
    setBusy(true);
    setError(null);

    const response = await fetch(`/api/admin/ai/generation-jobs/${jobId}/${action}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });

    const payload = await response.json().catch(() => null);
    setBusy(false);

    if (!response.ok) {
      setError(payload?.error?.message ?? `The job could not be ${action === "retry" ? "retried" : "cancelled"}.`);
      return;
    }

    router.refresh();
  };

  const canRetry = (status === "failed" || status === "cancelled") && attempts < MAX_JOB_ATTEMPTS_CLIENT;
  const canCancel = status === "queued" || status === "processing";

  if (!canRetry && !canCancel) return null;

  return (
    <span className="flex flex-col items-start gap-0.5">
      <span className="flex items-center gap-1.5">
        {canRetry && (
          <button
            type="button"
            disabled={busy}
            onClick={() => act("retry")}
            aria-label={`Retry job ${reference}`}
            className="text-[12px] font-medium text-blue-700 hover:underline disabled:opacity-50 dark:text-blue-400"
          >
            {busy ? "…" : "Retry"}
          </button>
        )}
        {canCancel && (
          <button
            type="button"
            disabled={busy}
            onClick={() => act("cancel")}
            aria-label={`Cancel job ${reference}`}
            className="text-[12px] font-medium text-rose-700 hover:underline disabled:opacity-50 dark:text-rose-400"
          >
            {busy ? "…" : "Cancel"}
          </button>
        )}
      </span>
      {error && <span className="max-w-[220px] text-[11px] leading-snug text-rose-600 dark:text-rose-400">{error}</span>}
    </span>
  );
}
