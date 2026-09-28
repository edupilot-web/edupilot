"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CheckCircleIcon, ClockIcon } from "@/components/icons";
import { ASSIGNMENT_STUDENT_STATUS_LABELS } from "@/lib/teaching/fields";
import type { SubmissionRow } from "@/lib/teaching/submissions";

/**
 * The submissions table and the grading panel (§43, §44).
 *
 * One screen rather than a table that links to a grading page: marking is a
 * repetitive job, and making a teacher navigate away and back for each of a
 * hundred students is the difference between an evening and a weekend. The
 * panel opens in place, and moving to the next student keeps it open.
 *
 * What it shows about a student is what §45 allows — name, email, status,
 * marks. There is no phone number and no other subject: a teacher marking work
 * has no need for either, and the query never fetched them.
 */

type GradeState = { marks: string; feedback: string };

export function SubmissionTable({
  assignmentId,
  rows,
  maxMarks,
  canGrade,
}: {
  assignmentId: string;
  rows: SubmissionRow[];
  maxMarks: number | null;
  canGrade: boolean;
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<"all" | "submitted" | "pending" | "graded">("all");
  const [search, setSearch] = useState("");
  const [openStudent, setOpenStudent] = useState<string | null>(null);
  const [grades, setGrades] = useState<Record<string, GradeState>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const visible = rows.filter((row) => {
    if (filter === "submitted" && !["submitted", "late"].includes(row.status)) return false;
    if (filter === "pending" && ["submitted", "late", "graded"].includes(row.status)) return false;
    if (filter === "graded" && row.status !== "graded") return false;

    if (search.trim()) {
      const needle = search.trim().toLowerCase();
      return (
        row.name.toLowerCase().includes(needle) || row.email.toLowerCase().includes(needle)
      );
    }

    return true;
  });

  async function grade(studentId: string) {
    if (busy) return;

    const state = grades[studentId];
    const marks = state?.marks?.trim() ? Number(state.marks) : null;

    if (marks !== null && !Number.isFinite(marks)) {
      setError("Enter a number, or leave the marks blank.");
      return;
    }

    setBusy(studentId);
    setError(null);

    try {
      const response = await fetch(
        `/api/teacher/assignments/${assignmentId}/submissions/${studentId}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ marks, feedback: state?.feedback?.trim() || null }),
        }
      );

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { error?: { message?: string } }
          | null;
        setError(payload?.error?.message ?? "That could not be saved.");
        return;
      }

      setOpenStudent(null);
      // The row's status, the roll-ups on the assignment and the pending count
      // in the header all come from the server; refreshing is what keeps them
      // in step rather than three client-side recalculations.
      startTransition(() => router.refresh());
    } catch {
      setError("The connection dropped. Try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        {(["all", "submitted", "pending", "graded"] as const).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            aria-pressed={filter === key}
            className={`rounded-full px-3 py-1.5 text-[13px] font-medium capitalize transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 ${
              filter === key
                ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                : "border border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            }`}
          >
            {key}
          </button>
        ))}

        <label htmlFor="submission-search" className="sr-only">
          Search students
        </label>
        <input
          id="submission-search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search by name or email"
          className="ml-auto w-56 rounded-lg border border-slate-200 px-3 py-1.5 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
        />
      </div>

      {error && (
        <p role="alert" className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-[13px] text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
          {error}
        </p>
      )}

      {visible.length === 0 ? (
        <p className="mt-6 rounded-xl border border-slate-200/80 bg-white p-8 text-center text-[14px] text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
          {rows.length === 0
            ? "Nobody has this assignment yet."
            : "No students match that filter."}
        </p>
      ) : (
        <ul className="mt-4 space-y-1.5">
          {visible.map((row) => {
            const open = openStudent === row.studentId;
            const state = grades[row.studentId] ?? {
              marks: row.marks !== null ? String(row.marks) : "",
              feedback: row.feedback ?? "",
            };

            return (
              <li
                key={row.studentId}
                className="rounded-xl border border-slate-200/80 bg-white dark:border-slate-800 dark:bg-slate-900"
              >
                <div className="flex flex-wrap items-center gap-3 p-3.5">
                  <StatusDot status={row.status} />

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-medium text-slate-900 dark:text-white">
                      {row.name}
                    </p>
                    <p className="truncate text-[12.5px] text-slate-500 dark:text-slate-400">
                      {row.email}
                    </p>
                  </div>

                  <div className="text-right">
                    <p className="text-[12.5px] text-slate-500 dark:text-slate-400">
                      {ASSIGNMENT_STUDENT_STATUS_LABELS[row.status]}
                      {row.isLate && <span className="ml-1.5 text-amber-600">late</span>}
                    </p>
                    {row.submittedAt && (
                      <p className="text-[11.5px] text-slate-400">
                        {formatDate(row.submittedAt)}
                      </p>
                    )}
                  </div>

                  {row.marks !== null && (
                    <p className="w-16 shrink-0 text-right text-[14px] font-semibold tabular-nums text-slate-900 dark:text-white">
                      {row.marks}
                      {maxMarks !== null && (
                        <span className="font-normal text-slate-400">/{maxMarks}</span>
                      )}
                    </p>
                  )}

                  {canGrade && row.submissionId && (
                    <button
                      type="button"
                      onClick={() => setOpenStudent(open ? null : row.studentId)}
                      className="shrink-0 rounded-lg border border-slate-200 px-3 py-1.5 text-[13px] font-medium text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                    >
                      {open ? "Close" : row.status === "graded" ? "Change" : "Grade"}
                    </button>
                  )}
                </div>

                {open && (
                  <div className="border-t border-slate-100 p-3.5 dark:border-slate-800">
                    <div className="grid gap-3 sm:grid-cols-[120px_minmax(0,1fr)]">
                      <div>
                        <label
                          htmlFor={`marks-${row.studentId}`}
                          className="block text-[12.5px] font-semibold text-slate-600 dark:text-slate-300"
                        >
                          Marks{maxMarks !== null ? ` (of ${maxMarks})` : ""}
                        </label>
                        <input
                          id={`marks-${row.studentId}`}
                          type="number"
                          min={0}
                          max={maxMarks ?? undefined}
                          value={state.marks}
                          onChange={(event) =>
                            setGrades((current) => ({
                              ...current,
                              [row.studentId]: { ...state, marks: event.target.value },
                            }))
                          }
                          className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-[14px] outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                        />
                      </div>

                      <div>
                        <label
                          htmlFor={`feedback-${row.studentId}`}
                          className="block text-[12.5px] font-semibold text-slate-600 dark:text-slate-300"
                        >
                          Feedback
                        </label>
                        <textarea
                          id={`feedback-${row.studentId}`}
                          rows={3}
                          value={state.feedback}
                          onChange={(event) =>
                            setGrades((current) => ({
                              ...current,
                              [row.studentId]: { ...state, feedback: event.target.value },
                            }))
                          }
                          placeholder="What they did well, and what to work on."
                          className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-[13.5px] outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                        />
                      </div>
                    </div>

                    <div className="mt-3 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void grade(row.studentId)}
                        disabled={busy === row.studentId || pending}
                        className="rounded-lg bg-blue-600 px-4 py-2 text-[13.5px] font-semibold text-white transition hover:bg-blue-700 disabled:opacity-60"
                      >
                        {busy === row.studentId ? "Saving..." : "Save grade"}
                      </button>

                      <a
                        href={`/api/teacher/assignments/${assignmentId}/submissions/${row.studentId}`}
                        className="text-[13px] font-medium text-slate-500 hover:underline dark:text-slate-400"
                      >
                        View submission
                      </a>

                      <p className="ml-auto text-[12px] text-slate-400">
                        {/* Said before they press it, not discovered after. */}
                        {row.status === "graded"
                          ? "Changing a grade does not send another notification."
                          : "The student is notified when you save."}
                      </p>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function StatusDot({ status }: { status: SubmissionRow["status"] }) {
  if (status === "graded") {
    return <CheckCircleIcon className="h-4 w-4 shrink-0 text-emerald-500" />;
  }
  if (status === "submitted" || status === "late") {
    return <CheckCircleIcon className="h-4 w-4 shrink-0 text-blue-500" />;
  }
  return <ClockIcon className="h-4 w-4 shrink-0 text-slate-300 dark:text-slate-600" />;
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(iso));
}
