"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { BUTTON_STYLES, Badge, type BadgeTone } from "@/components/admin/ui";
import type { TopicContentRow } from "@/lib/admin/data/topic-content";
import type { TopicContentStatus } from "@/lib/learning/fields";

/**
 * The per-subject content workbench (§45, §46).
 *
 * One row per topic, with the actions available at that row's current status.
 * The workflow is a straight line — generate, review, approve, publish — and
 * the screen shows exactly one forward step at a time rather than every verb
 * the API accepts. A row offering "Approve" and "Publish" simultaneously is a
 * row where somebody publishes without reading, which is the specific outcome
 * §45 exists to prevent.
 *
 * Selection exists for one reason: generating a unit's worth of topics in one
 * pass. It is capped at ten to match the endpoint, and the cap is shown rather
 * than enforced silently — a disabled button with no explanation reads as a
 * bug.
 */

const MAX_BATCH = 10;

export function SubjectContentWorkbench({
  rows,
  can,
}: {
  rows: TopicContentRow[];
  can: { generate: boolean; review: boolean; publish: boolean };
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busyTopic, setBusyTopic] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; message: string } | null>(null);

  function toggle(topicId: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(topicId)) next.delete(topicId);
      else if (next.size < MAX_BATCH) next.add(topicId);
      return next;
    });
  }

  /**
   * Refresh from the server rather than patching local state.
   *
   * A status transition changes derived things this component does not hold —
   * the coverage badge in the header, the review queue on the parent screen —
   * and reconstructing those client-side is how two numbers on one page start
   * disagreeing.
   */
  function refresh() {
    startTransition(() => router.refresh());
  }

  async function call(
    url: string,
    init: RequestInit,
    onSuccess: string
  ): Promise<boolean> {
    try {
      const response = await fetch(url, {
        headers: { "Content-Type": "application/json" },
        ...init,
      });
      const payload = (await response.json().catch(() => null)) as
        | { error?: { message?: string } }
        | null;

      if (!response.ok) {
        setNotice({
          tone: "error",
          message: payload?.error?.message ?? "That did not work. Try again.",
        });
        return false;
      }

      setNotice({ tone: "ok", message: onSuccess });
      refresh();
      return true;
    } catch {
      setNotice({ tone: "error", message: "The request could not be sent. Check your connection." });
      return false;
    }
  }

  async function generate(topicIds: string[], replaceDraft: boolean) {
    setBusyTopic(topicIds.length === 1 ? topicIds[0] : "batch");
    const ok = await call(
      "/api/admin/topic-content/generate",
      { method: "POST", body: JSON.stringify({ topicIds, replaceDraft }) },
      topicIds.length === 1
        ? "Draft written. Read it, then send it for review."
        : `${topicIds.length} drafts written. Each still needs reading.`
    );
    if (ok) setSelected(new Set());
    setBusyTopic(null);
  }

  async function transition(row: TopicContentRow, status: TopicContentStatus, label: string) {
    if (!row.contentId) return;
    setBusyTopic(row.topicId);
    await call(
      `/api/admin/topic-content/${row.contentId}`,
      { method: "PATCH", body: JSON.stringify({ status }) },
      label
    );
    setBusyTopic(null);
  }

  async function publish(row: TopicContentRow) {
    if (!row.contentId) return;

    /**
     * A confirmation the administrator has to answer, not a flag the client
     * sets on their behalf.
     *
     * The endpoint requires `academicallyReviewed: true` and refuses without
     * it. Sending it automatically would satisfy the check while defeating its
     * entire purpose, so the assertion is made here by a person.
     */
    const confirmed = window.confirm(
      `Publish the explanation for "${row.title}"?\n\nStudents will read this. Confirm that you have read it and that it is academically correct.`
    );
    if (!confirmed) return;

    setBusyTopic(row.topicId);
    await call(
      `/api/admin/topic-content/${row.contentId}/publish`,
      { method: "POST", body: JSON.stringify({ academicallyReviewed: true }) },
      "Published. Students can read it now."
    );
    setBusyTopic(null);
  }

  async function unpublish(row: TopicContentRow) {
    if (!row.contentId) return;

    const reason = window.prompt(
      `Why are you taking "${row.title}" down?\n\nThe reason is recorded in the audit log.`
    );
    if (!reason || reason.trim().length < 5) return;

    setBusyTopic(row.topicId);
    await call(
      `/api/admin/topic-content/${row.contentId}/publish`,
      { method: "DELETE", body: JSON.stringify({ reason: reason.trim() }) },
      "Taken down. It is back in the approved state."
    );
    setBusyTopic(null);
  }

  const missing = rows.filter((row) => !row.contentId);

  return (
    <div>
      {notice && (
        <p
          role="status"
          className={`mb-3 rounded-lg px-3 py-2 text-[13px] ${
            notice.tone === "ok"
              ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300"
              : "bg-rose-50 text-rose-800 dark:bg-rose-500/10 dark:text-rose-300"
          }`}
        >
          {notice.message}
        </p>
      )}

      {can.generate && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={selected.size === 0 || busyTopic !== null || pending}
            onClick={() => void generate([...selected], false)}
            className={BUTTON_STYLES.primary}
          >
            {busyTopic === "batch"
              ? "Generating..."
              : `Generate ${selected.size || ""} selected`.trim()}
          </button>

          <button
            type="button"
            disabled={missing.length === 0 || busyTopic !== null || pending}
            onClick={() =>
              setSelected(new Set(missing.slice(0, MAX_BATCH).map((row) => row.topicId)))
            }
            className={BUTTON_STYLES.secondary}
          >
            Select next {Math.min(missing.length, MAX_BATCH)} unwritten
          </button>

          <p className="text-[12px] text-slate-400 dark:text-slate-500">
            {/*
              The cap is stated. A checkbox that silently refuses to tick is
              indistinguishable from a broken one.
            */}
            At most {MAX_BATCH} at a time — each one costs a provider call.
          </p>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-y border-slate-100 text-left dark:border-slate-800">
              {can.generate && <th className="w-9 px-3 py-2" />}
              <th className="px-3 py-2 text-[11.5px] font-semibold uppercase tracking-wide text-slate-400">
                Topic
              </th>
              <th className="hidden px-3 py-2 text-[11.5px] font-semibold uppercase tracking-wide text-slate-400 lg:table-cell">
                Unit
              </th>
              <th className="px-3 py-2 text-[11.5px] font-semibold uppercase tracking-wide text-slate-400">
                Status
              </th>
              <th className="hidden px-3 py-2 text-[11.5px] font-semibold uppercase tracking-wide text-slate-400 lg:table-cell">
                Written by
              </th>
              <th className="px-3 py-2 text-right text-[11.5px] font-semibold uppercase tracking-wide text-slate-400">
                Actions
              </th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {rows.map((row) => {
              const busy = busyTopic === row.topicId || pending;

              return (
                <tr key={row.topicId} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                  {can.generate && (
                    <td className="px-3 py-2.5 align-middle">
                      <input
                        type="checkbox"
                        aria-label={`Select ${row.title}`}
                        checked={selected.has(row.topicId)}
                        onChange={() => toggle(row.topicId)}
                        disabled={busy}
                        className="h-3.5 w-3.5 rounded border-slate-300"
                      />
                    </td>
                  )}

                  <td className="max-w-[320px] px-3 py-2.5 align-middle">
                    <p className="truncate text-[13.5px] font-medium text-slate-900 dark:text-white">
                      {row.sequence}. {row.title}
                    </p>
                    <p className="mt-0.5 text-[12px] capitalize text-slate-400 dark:text-slate-500">
                      {row.difficulty}
                      {row.subtopicCount > 0 && ` · ${row.subtopicCount} subtopics`}
                      {row.contentVersion && row.contentVersion > 1 && ` · v${row.contentVersion}`}
                    </p>
                  </td>

                  <td className="hidden px-3 py-2.5 align-middle text-[13px] text-slate-500 lg:table-cell dark:text-slate-400">
                    {row.unitNumber !== null ? `Unit ${row.unitNumber}` : "—"}
                  </td>

                  <td className="px-3 py-2.5 align-middle">
                    <Badge tone={toneFor(row.status)}>{row.statusLabel}</Badge>
                  </td>

                  <td className="hidden px-3 py-2.5 align-middle text-[13px] text-slate-500 lg:table-cell dark:text-slate-400">
                    {row.origin === "authored"
                      ? "A person"
                      : row.origin
                        ? `AI (${row.provider ?? "unknown"})`
                        : "—"}
                  </td>

                  <td className="px-3 py-2.5 text-right align-middle">
                    <span className="inline-flex flex-wrap items-center justify-end gap-1.5">
                      {!row.contentId && can.generate && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void generate([row.topicId], false)}
                          className={BUTTON_STYLES.secondary}
                        >
                          {busy ? "Generating..." : "Generate"}
                        </button>
                      )}

                      {row.status === "ai-draft" && (
                        <>
                          {can.generate && (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void generate([row.topicId], true)}
                              className={BUTTON_STYLES.ghost}
                            >
                              Regenerate
                            </button>
                          )}
                          {can.review && (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() =>
                                void transition(row, "editor-review", "Moved into review.")
                              }
                              className={BUTTON_STYLES.secondary}
                            >
                              Send to review
                            </button>
                          )}
                        </>
                      )}

                      {row.status === "editor-review" && can.review && (
                        <>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void transition(row, "ai-draft", "Sent back to draft.")}
                            className={BUTTON_STYLES.ghost}
                          >
                            Send back
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void transition(row, "approved", "Approved.")}
                            className={BUTTON_STYLES.secondary}
                          >
                            Approve
                          </button>
                        </>
                      )}

                      {row.status === "approved" && can.publish && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void publish(row)}
                          className={BUTTON_STYLES.primary}
                        >
                          Publish
                        </button>
                      )}

                      {row.status === "published" && can.publish && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void unpublish(row)}
                          className={BUTTON_STYLES.danger}
                        >
                          Take down
                        </button>
                      )}

                      {/*
                        A row with nothing to offer says so, rather than
                        rendering an empty cell that looks like a loading state.
                      */}
                      {actionCount(row, can) === 0 && (
                        <span className="text-[12px] text-slate-300 dark:text-slate-600">
                          No action for you
                        </span>
                      )}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function toneFor(status: TopicContentStatus | null): BadgeTone {
  if (!status) return "neutral";
  const tones: Record<TopicContentStatus, BadgeTone> = {
    "ai-draft": "warning",
    "editor-review": "info",
    approved: "purple",
    published: "success",
    archived: "neutral",
  };
  return tones[status];
}

/**
 * How many buttons this row will render.
 *
 * Computed rather than inferred from the JSX, so the "No action for you" fallback
 * cannot disagree with what is actually shown — which is what happens when a new
 * action is added and the fallback's condition is not updated with it.
 */
function actionCount(
  row: TopicContentRow,
  can: { generate: boolean; review: boolean; publish: boolean }
): number {
  if (!row.contentId) return can.generate ? 1 : 0;

  switch (row.status) {
    case "ai-draft":
      return (can.generate ? 1 : 0) + (can.review ? 1 : 0);
    case "editor-review":
      return can.review ? 2 : 0;
    case "approved":
      return can.publish ? 1 : 0;
    case "published":
      return can.publish ? 1 : 0;
    default:
      return 0;
  }
}
