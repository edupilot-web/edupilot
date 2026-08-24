"use client";

import { useState } from "react";
import { VerificationBadge } from "@/components/admin/status";
import { BUTTON_STYLES, Card } from "@/components/admin/ui";

/**
 * The verify / reject / needs-review control (spec §19).
 *
 * One component for colleges, universities and students, because the decision
 * is the same shape in all three: a status, an optional note, and a record in
 * the audit log. Building three would produce three subtly different sets of
 * copy for the same act.
 *
 * Rejecting requires a note. A rejection with no reason is unanswerable by
 * whoever submitted the record, and turns into a support conversation that the
 * note would have avoided.
 */
export function VerifyPanel({
  id,
  status,
  note,
  verifiedAt,
  action,
  label = "Verification",
}: {
  id: string;
  status: string;
  note: string | null;
  verifiedAt: string | null;
  /** Server Action taking `id`, `decision` and `note`. */
  action: (formData: FormData) => Promise<void>;
  label?: string;
}) {
  const [decision, setDecision] = useState<"verify" | "reject" | "review" | null>(null);
  const [reason, setReason] = useState("");

  const needsReason = decision === "reject";
  const ready = decision !== null && (!needsReason || reason.trim().length >= 5);

  return (
    <Card title={label}>
      <div className="flex items-center justify-between gap-2">
        <VerificationBadge status={status} />
        {verifiedAt && <span className="text-[11.5px] text-slate-400">{verifiedAt}</span>}
      </div>

      {note && (
        <p className="mt-2 rounded-md bg-slate-50 px-2.5 py-1.5 text-[12px] leading-relaxed text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">
          {note}
        </p>
      )}

      <form action={action} className="mt-3 space-y-2.5">
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="decision" value={decision ?? ""} />

        <div className="grid grid-cols-3 gap-1.5">
          {(
            [
              { value: "verify", label: "Verify", tone: "emerald" },
              { value: "review", label: "Review", tone: "violet" },
              { value: "reject", label: "Reject", tone: "rose" },
            ] as const
          ).map((choice) => {
            const selected = decision === choice.value;
            return (
              <button
                key={choice.value}
                type="button"
                onClick={() => setDecision(selected ? null : choice.value)}
                aria-pressed={selected}
                className={`rounded-md border px-2 py-1.5 text-[12px] font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 ${
                  selected
                    ? choice.tone === "emerald"
                      ? "border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"
                      : choice.tone === "rose"
                        ? "border-rose-500 bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300"
                        : "border-violet-500 bg-violet-50 text-violet-700 dark:bg-violet-500/10 dark:text-violet-300"
                    : "border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                }`}
              >
                {choice.label}
              </button>
            );
          })}
        </div>

        {decision && (
          <>
            <label className="block">
              <span className="mb-1 block text-[12px] text-slate-500 dark:text-slate-400">
                {needsReason ? "Reason (required)" : "Note (optional)"}
              </span>
              <textarea
                name="note"
                rows={3}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder={
                  needsReason
                    ? "What is wrong with this record? The submitter will be told."
                    : "Anything worth recording alongside the decision."
                }
                className="w-full resize-y rounded-lg border border-slate-200 px-2.5 py-2 text-[12.5px] outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-900/5 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
              />
            </label>

            <button type="submit" disabled={!ready} className={`${BUTTON_STYLES.primary} w-full`}>
              Record decision
            </button>

            {needsReason && reason.trim().length < 5 && (
              <p className="text-[11.5px] text-slate-400">
                A rejection needs a reason — the record is sent back to whoever submitted it.
              </p>
            )}
          </>
        )}
      </form>
    </Card>
  );
}
