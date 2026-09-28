"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  AlertIcon,
  CheckCircleIcon,
  ChevronRightIcon,
  ClockIcon,
  PaperclipIcon,
} from "@/components/icons";
import { StatusBadge, formatDue } from "@/components/app/assignment-list";
import { APP_ROUTES } from "@/lib/app-routes";
import type { StudentAssignmentDetail } from "@/lib/teaching/student-view";

/**
 * One assignment, and the form to hand it in (§26, §70).
 *
 * Ordered for a phone, which is where most of these students are: what it is,
 * what to do, what is attached, when it is due, then the submit box. A desktop
 * gets the same order with more room — there is no second layout, because the
 * order that works on a 360px screen is not worse on a laptop.
 *
 * The submit button is driven by the server's `window`, which the detail read
 * computed with the same function the submit endpoint uses. A button that is
 * enabled while the endpoint refuses is the worst of the possible
 * disagreements, and sharing the function is what prevents it.
 */
export function AssignmentDetail({ assignment }: { assignment: StudentAssignmentDetail }) {
  return (
    <div className="mx-auto max-w-3xl">
      <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-[13px] text-slate-400">
        <Link href={APP_ROUTES.assignments} className="transition hover:text-slate-600 dark:hover:text-slate-300">
          Assignments
        </Link>
        <ChevronRightIcon className="h-3.5 w-3.5" />
        <span className="truncate text-slate-500 dark:text-slate-400">{assignment.subjectCode}</span>
      </nav>

      <header className="mt-5 rounded-2xl border border-slate-200/80 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[12.5px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
              {assignment.subjectCode ? `${assignment.subjectCode} · ` : ""}
              {assignment.subjectName ?? "Subject"}
            </p>
            <h1 className="mt-1 text-[23px] font-bold leading-tight tracking-tight text-slate-900 dark:text-white">
              {assignment.title}
            </h1>
          </div>
          <StatusBadge status={assignment.displayStatus} />
        </div>

        <div className="mt-3.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[13px] text-slate-500 dark:text-slate-400">
          {assignment.teacherName && <span>Set by {assignment.teacherName}</span>}
          {assignment.dueAt && (
            <span className="inline-flex items-center gap-1.5">
              <ClockIcon className="h-3.5 w-3.5" />
              Due {formatDue(assignment.dueAt)}
            </span>
          )}
          {assignment.maxMarks !== null && <span>{assignment.maxMarks} marks</span>}
        </div>

        {assignment.description && (
          <p className="mt-3.5 text-[14.5px] leading-relaxed text-slate-600 dark:text-slate-300">
            {assignment.description}
          </p>
        )}
      </header>

      {assignment.instructions && (
        <section className="mt-4 rounded-2xl border border-slate-200/80 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="text-[15px] font-semibold text-slate-900 dark:text-white">What to do</h2>
          <div className="mt-2.5 space-y-2.5">
            {assignment.instructions.split(/\n{2,}/).map((paragraph, index) => (
              <p
                key={index}
                className="whitespace-pre-line text-[14.5px] leading-relaxed text-slate-700 dark:text-slate-200"
              >
                {paragraph}
              </p>
            ))}
          </div>
        </section>
      )}

      {assignment.attachments.length > 0 && (
        <section className="mt-4 rounded-2xl border border-slate-200/80 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="text-[15px] font-semibold text-slate-900 dark:text-white">Attachments</h2>
          <ul className="mt-2.5 space-y-1.5">
            {assignment.attachments.map((file) => (
              <li key={file.fileId}>
                <FileLink file={file} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {assignment.topicId && (
        <Link
          href={`${APP_ROUTES.curriculum}/${assignment.subjectId}/topics/${assignment.topicId}`}
          className="mt-4 flex items-center gap-2 rounded-xl border border-slate-200/80 bg-white px-4 py-3 text-[13.5px] font-medium text-slate-700 transition hover:border-blue-300 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
        >
          {/*
            The link back into the curriculum is §51's whole point: the
            assignment, the notes and the AI tutor all sit on the same topic,
            and a student stuck on the work should be one tap from the
            explanation.
          */}
          Read the topic this covers
          <ChevronRightIcon className="ml-auto h-4 w-4 text-slate-400" />
        </Link>
      )}

      <SubmissionSection assignment={assignment} />
    </div>
  );
}

function SubmissionSection({ assignment }: { assignment: StudentAssignmentDetail }) {
  if (assignment.submission) {
    return <SubmittedPanel assignment={assignment} />;
  }
  return <SubmitForm assignment={assignment} />;
}

function SubmittedPanel({ assignment }: { assignment: StudentAssignmentDetail }) {
  const [resubmitting, setResubmitting] = useState(false);
  const submission = assignment.submission!;

  return (
    <section className="mt-4 rounded-2xl border border-slate-200/80 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-[15px] font-semibold text-slate-900 dark:text-white">
          <CheckCircleIcon className="h-4 w-4 text-emerald-500" />
          Submitted
        </h2>
        <p className="text-[12.5px] text-slate-400">
          {submission.submittedAt && formatDue(submission.submittedAt)}
          {submission.isLate && <span className="ml-2 text-amber-600">Late</span>}
          {submission.attemptNumber > 1 && (
            <span className="ml-2">Attempt {submission.attemptNumber}</span>
          )}
        </p>
      </div>

      {submission.content && (
        <pre className="mt-3 overflow-x-auto whitespace-pre-wrap rounded-xl bg-slate-50 p-3.5 text-[13px] leading-relaxed text-slate-700 dark:bg-slate-800/60 dark:text-slate-200">
          {submission.content}
        </pre>
      )}

      {submission.links.length > 0 && (
        <ul className="mt-3 space-y-1">
          {submission.links.map((link) => (
            <li key={link} className="truncate text-[13px]">
              {/*
                `noopener noreferrer` on every outbound link: a student's
                submitted URL is untrusted input, and `window.opener` is a real
                way for a page they linked to reach back into this one.
              */}
              <a
                href={link}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="text-blue-600 hover:underline dark:text-blue-400"
              >
                {link}
              </a>
            </li>
          ))}
        </ul>
      )}

      {submission.attachments.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {submission.attachments.map((file) => (
            <li key={file.fileId}>
              <FileLink file={file} />
            </li>
          ))}
        </ul>
      )}

      {assignment.displayStatus === "graded" && (
        <div className="mt-4 rounded-xl border border-emerald-200/70 bg-emerald-50/60 p-4 dark:border-emerald-500/20 dark:bg-emerald-500/10">
          <p className="text-[13px] font-semibold text-emerald-900 dark:text-emerald-200">
            {assignment.marks !== null
              ? `${assignment.marks}${assignment.maxMarks !== null ? ` out of ${assignment.maxMarks}` : ""}`
              : "Marked"}
          </p>
          {assignment.feedback && (
            <p className="mt-1.5 whitespace-pre-line text-[13.5px] leading-relaxed text-emerald-900/90 dark:text-emerald-100/90">
              {assignment.feedback}
            </p>
          )}
        </div>
      )}

      {assignment.window.open && assignment.displayStatus !== "graded" && (
        <div className="mt-4">
          {resubmitting ? (
            <SubmitForm assignment={assignment} embedded />
          ) : (
            <button
              type="button"
              onClick={() => setResubmitting(true)}
              className="text-[13px] font-semibold text-blue-600 hover:underline dark:text-blue-400"
            >
              Submit again
            </button>
          )}
          <p className="mt-1 text-[12px] text-slate-400">
            {/* Said before they act, not discovered after. */}
            Your previous attempt is kept, but only the newest is marked.
          </p>
        </div>
      )}
    </section>
  );
}

function SubmitForm({
  assignment,
  embedded = false,
}: {
  assignment: StudentAssignmentDetail;
  embedded?: boolean;
}) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const wantsText = assignment.submissionType === "text" || assignment.submissionType === "code";
  const wantsLink = assignment.submissionType === "link";
  const wantsAny = assignment.submissionType === "mixed";

  if (!assignment.window.open) {
    return (
      <section className={embedded ? "" : "mt-4 rounded-2xl border border-slate-200/80 bg-white p-6 dark:border-slate-800 dark:bg-slate-900"}>
        <p className="flex items-start gap-2 text-[13.5px] leading-relaxed text-slate-500 dark:text-slate-400">
          <AlertIcon className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
          {assignment.window.reason ?? "Submissions are closed."}
        </p>
      </section>
    );
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;

    setBusy(true);
    setError(null);

    try {
      const response = await fetch(`/api/student/assignments/${assignment.id}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: text.trim() || null,
          links: link.trim() ? [link.trim()] : [],
        }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { error?: { message?: string } }
          | null;
        setError(payload?.error?.message ?? "That could not be submitted. Try again.");
        return;
      }

      // Refresh rather than patching state: the grade, the status badge and the
      // "submitted" panel all come from the server, and rebuilding them here
      // would be a second source of truth for the same three facts.
      router.refresh();
    } catch {
      setError("The connection dropped. Check your network and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      className={
        embedded
          ? ""
          : "mt-4 rounded-2xl border border-slate-200/80 bg-white p-6 dark:border-slate-800 dark:bg-slate-900"
      }
    >
      {!embedded && (
        <h2 className="text-[15px] font-semibold text-slate-900 dark:text-white">
          Your submission
        </h2>
      )}

      {assignment.window.isLate && (
        <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-[13px] text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">
          The due date has passed. This will be marked as a late submission.
        </p>
      )}

      <form onSubmit={submit} className="mt-3 space-y-3">
        {(wantsText || wantsAny) && (
          <div>
            <label
              htmlFor="submission-text"
              className="block text-[12.5px] font-semibold text-slate-600 dark:text-slate-300"
            >
              {assignment.submissionType === "code" ? "Your code" : "Your answer"}
            </label>
            <textarea
              id="submission-text"
              value={text}
              onChange={(event) => setText(event.target.value)}
              rows={assignment.submissionType === "code" ? 10 : 6}
              maxLength={50000}
              className={`mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-[14px] text-slate-700 outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 ${
                assignment.submissionType === "code" ? "font-mono text-[13px]" : ""
              }`}
              placeholder={
                assignment.submissionType === "code"
                  ? "Paste your code here"
                  : "Type your answer here"
              }
            />
          </div>
        )}

        {(wantsLink || wantsAny) && (
          <div>
            <label
              htmlFor="submission-link"
              className="block text-[12.5px] font-semibold text-slate-600 dark:text-slate-300"
            >
              Link
            </label>
            <input
              id="submission-link"
              type="url"
              value={link}
              onChange={(event) => setLink(event.target.value)}
              placeholder="https://"
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-[14px] text-slate-700 outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            />
          </div>
        )}

        {assignment.submissionType === "file" && (
          <p className="rounded-lg bg-slate-50 px-3 py-2.5 text-[13px] leading-relaxed text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
            {/*
              Honest about what is not built rather than rendering a file input
              that cannot work. Uploads need a configured storage driver, and a
              picker that silently fails is worse than a sentence saying so.
            */}
            This assignment asks for a file. File uploads need storage to be configured on this
            deployment — ask your teacher how to hand this one in.
          </p>
        )}

        {error && (
          <p role="alert" className="text-[13px] text-rose-600 dark:text-rose-400">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-5 py-2.5 text-[14px] font-semibold text-white transition hover:bg-blue-700 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-500/25"
        >
          {busy ? "Submitting..." : "Submit assignment"}
        </button>
      </form>
    </section>
  );
}

export function FileLink({
  file,
}: {
  file: { fileId: string; fileName: string; mimeType: string; size: number };
}) {
  return (
    <a
      href={`/api/files/${file.fileId}`}
      className="flex items-center gap-2.5 rounded-lg border border-slate-200/80 px-3 py-2 text-[13.5px] text-slate-700 transition hover:border-blue-300 hover:bg-blue-50/40 dark:border-slate-800 dark:text-slate-200 dark:hover:bg-blue-500/5"
    >
      <PaperclipIcon className="h-4 w-4 shrink-0 text-slate-400" />
      <span className="min-w-0 flex-1 truncate">{file.fileName}</span>
      <span className="shrink-0 text-[12px] text-slate-400">{formatBytes(file.size)}</span>
    </a>
  );
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
