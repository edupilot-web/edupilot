"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * The publish button, and the confirmation in front of it (§15, §17).
 *
 * Publishing is the one irreversible-feeling action in the module: it writes a
 * row per student and sends a notification each, and there is no "unsend". The
 * confirmation states the number of students, because that is the fact a
 * teacher should check before they commit — a mistargeted assignment is almost
 * always the wrong subject, and the count is where that shows up.
 *
 * Publishing to nobody is allowed and reported (§78). Refusing would be worse:
 * the assignment is valid, the teacher meant it, and the usual cause is a
 * cohort that has moved on — which they can only diagnose if the publish tells
 * them.
 */
export function PublishPanel({
  assignmentId,
  canPublish,
}: {
  assignmentId: string;
  canPublish: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  async function publish() {
    if (busy) return;

    const confirmed = window.confirm(
      "Publish this assignment?\n\nEvery student currently in this subject's year and semester will receive it and be notified. You cannot unsend it."
    );
    if (!confirmed) return;

    setBusy(true);
    setError(null);
    setWarning(null);

    try {
      const response = await fetch(`/api/teacher/assignments/${assignmentId}/publish`, {
        method: "POST",
      });

      const payload = (await response.json().catch(() => null)) as
        | {
            data?: { eligibleStudents?: number; warning?: string | null };
            error?: { message?: string };
          }
        | null;

      if (!response.ok) {
        setError(payload?.error?.message ?? "That could not be published.");
        return;
      }

      if (payload?.data?.warning) {
        // Shown in place rather than navigating away: the teacher needs to read
        // it, and the submissions page they would land on would be empty and
        // unexplained.
        setWarning(payload.data.warning);
        router.refresh();
        return;
      }

      router.push(`/teacher/assignments/${assignmentId}/submissions`);
    } catch {
      setError("The connection dropped. Check your network and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4">
      <button
        type="button"
        onClick={() => void publish()}
        disabled={busy || !canPublish}
        className="rounded-lg bg-blue-600 px-5 py-2.5 text-[14px] font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-500/25"
      >
        {busy ? "Publishing..." : "Publish assignment"}
      </button>

      {!canPublish && (
        <p className="mt-2 text-[12.5px] text-blue-900/70 dark:text-blue-100/70">
          Publishing opens up once your account is approved and your email is confirmed.
        </p>
      )}

      {warning && (
        <p role="status" className="mt-3 rounded-lg bg-amber-50 px-3 py-2.5 text-[13px] leading-relaxed text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
          {warning}
        </p>
      )}

      {error && (
        <p role="alert" className="mt-3 rounded-lg bg-rose-50 px-3 py-2.5 text-[13px] text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
          {error}
        </p>
      )}
    </div>
  );
}
