"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { PRIORITIES, PRIORITY_LABELS, type Priority, type RequestStatus } from "@/lib/service-requests/fields";

/**
 * Where a request is actually worked.
 *
 * One form, one save. A clerk assigns it to themselves, writes a reply and moves
 * it to in-progress in a single action — three separate buttons would be three
 * round trips and three chances to half-apply the change.
 *
 * The status options come from the server, generated from the same transition
 * table it checks against. A screen that offered a button the server would
 * refuse is how a queue teaches its users not to trust it.
 */
export function ServiceRequestWorkbench({
  requestId,
  status,
  priority,
  assignedToName,
  nextStatuses,
  canHandle,
}: {
  requestId: string;
  status: RequestStatus;
  priority: Priority;
  assignedToName: string | null;
  nextStatuses: { key: RequestStatus; label: string }[];
  canHandle: boolean;
}) {
  const router = useRouter();

  const [nextStatus, setNextStatus] = useState<RequestStatus | "">("");
  const [nextPriority, setNextPriority] = useState<Priority>(priority);
  const [comment, setComment] = useState("");
  const [internal, setInternal] = useState(false);
  const [resolution, setResolution] = useState("");
  const [assign, setAssign] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Terminal states need an outcome the student can read. */
  const needsResolution = nextStatus === "resolved" || nextStatus === "rejected";

  if (!canHandle) {
    return (
      <p className="rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-[13px] text-slate-600 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300">
        You can see this request but not act on it. That needs the{" "}
        <code className="rounded bg-slate-200 px-1 dark:bg-slate-700">service_request.handle</code>{" "}
        permission.
      </p>
    );
  }

  const save = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);

    try {
      const response = await fetch(`/api/admin/service-requests/${requestId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(nextStatus ? { status: nextStatus } : {}),
          ...(nextPriority !== priority ? { priority: nextPriority } : {}),
          ...(assign ? { assignToSelf: true } : {}),
          ...(comment.trim() ? { comment: comment.trim(), internal } : {}),
          ...(resolution.trim() ? { resolution: resolution.trim() } : {}),
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        setError(payload?.error?.message ?? "That could not be saved.");
        return;
      }

      setComment("");
      setResolution("");
      setNextStatus("");
      setAssign(false);
      router.refresh();
    } catch {
      setError("The connection dropped. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const nothingToDo =
    !nextStatus && nextPriority === priority && !assign && !comment.trim() && !resolution.trim();

  return (
    <div className="space-y-4">
      {error && (
        <p
          role="alert"
          className="rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-[13px] text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200"
        >
          {error}
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label
            htmlFor="sr-status"
            className="block text-[12.5px] font-semibold text-slate-600 dark:text-slate-300"
          >
            Move to
          </label>
          <select
            id="sr-status"
            value={nextStatus}
            onChange={(event) => setNextStatus(event.target.value as RequestStatus | "")}
            disabled={nextStatuses.length === 0}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-[13.5px] outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            <option value="">
              {nextStatuses.length ? "Leave as it is" : "Closed — nothing to change"}
            </option>
            {nextStatuses.map((entry) => (
              <option key={entry.key} value={entry.key}>
                {entry.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            htmlFor="sr-priority"
            className="block text-[12.5px] font-semibold text-slate-600 dark:text-slate-300"
          >
            Priority
          </label>
          <select
            id="sr-priority"
            value={nextPriority}
            onChange={(event) => setNextPriority(event.target.value as Priority)}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-[13.5px] outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            {PRIORITIES.map((key) => (
              <option key={key} value={key}>
                {PRIORITY_LABELS[key]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {!assignedToName && (
        <label className="flex items-center gap-2 text-[13px] text-slate-600 dark:text-slate-300">
          <input
            type="checkbox"
            checked={assign}
            onChange={(event) => setAssign(event.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-800"
          />
          Take this one
        </label>
      )}

      <div>
        <label
          htmlFor="sr-comment"
          className="block text-[12.5px] font-semibold text-slate-600 dark:text-slate-300"
        >
          {internal ? "Internal note" : "Reply to the student"}
        </label>
        <textarea
          id="sr-comment"
          rows={3}
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          placeholder={
            internal
              ? "Only the team sees this."
              : "The student sees this and is notified about it."
          }
          className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-[13.5px] outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
        />

        {/* Visible is the default, and the label says which it is right now —
            a note meant for the student that goes internal is a student left
            waiting, and the reverse is worse. */}
        <label className="mt-1.5 flex items-center gap-2 text-[12.5px] text-slate-500 dark:text-slate-400">
          <input
            type="checkbox"
            checked={internal}
            onChange={(event) => setInternal(event.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-slate-600 focus:ring-slate-400 dark:border-slate-600 dark:bg-slate-800"
          />
          Internal note — the student never sees this
        </label>
      </div>

      {needsResolution && (
        <div>
          <label
            htmlFor="sr-resolution"
            className="block text-[12.5px] font-semibold text-slate-600 dark:text-slate-300"
          >
            {nextStatus === "rejected" ? "Why is this being declined?" : "What was done?"}
          </label>
          <textarea
            id="sr-resolution"
            rows={3}
            required
            value={resolution}
            onChange={(event) => setResolution(event.target.value)}
            placeholder={
              nextStatus === "rejected"
                ? "The student sees this. A decline with no reason is a student raising the same request again."
                : "Unlocked the account and sent a fresh verification email."
            }
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-[13.5px] outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          />
        </div>
      )}

      <button
        type="button"
        onClick={save}
        disabled={busy || nothingToDo || (needsResolution && !resolution.trim())}
        className="rounded-lg bg-blue-600 px-4 py-2 text-[13.5px] font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? "Saving…" : "Save"}
      </button>

      <p className="text-[12px] text-slate-400 dark:text-slate-500">
        Current status: <strong>{status.replace(/_/g, " ")}</strong>
        {assignedToName ? ` · with ${assignedToName}` : " · unassigned"}
      </p>
    </div>
  );
}
