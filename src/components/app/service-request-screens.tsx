"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  CATEGORY_BLURBS,
  CATEGORY_LABELS,
  REQUEST_CATEGORIES,
  REQUEST_LIMITS,
  REQUEST_TYPES,
  STATUS_BLURBS,
  TARGET_DAYS,
  type RequestCategory,
  type RequestStatus,
} from "@/lib/service-requests/fields";

/**
 * The student's side of support: a list, a form, and a conversation.
 *
 * This is for **EduPilot itself** — an account somebody cannot get into, a
 * top-up that did not arrive, a subject list that is wrong. Not a campus help
 * desk: there is no registrar here to issue a certificate and no warden to fix
 * a tap, and a category the platform cannot resolve is worse than none at all.
 *
 * The status wording is aimed at somebody waiting, not at the team. "In review"
 * means nothing to a student locked out of their account; "someone has
 * picked this up" is the same fact and answers the question they actually have.
 */

type Card = {
  id: string;
  ticket: string;
  categoryLabel: string;
  typeLabel: string;
  subject: string;
  status: RequestStatus;
  statusLabel: string;
  targetAt: string | null;
  overdue: boolean;
  unread: number;
  updatedAt: string;
};

const TONES: Record<RequestStatus, string> = {
  submitted: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  in_review: "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300",
  in_progress: "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300",
  awaiting_student: "bg-amber-50 text-amber-800 dark:bg-amber-500/10 dark:text-amber-300",
  resolved: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300",
  rejected: "bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300",
  cancelled: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
};

// ── List ──────────────────────────────────────────────────────────────────

export function ServiceRequestList({
  initial,
  counts,
  filter,
}: {
  initial: Card[];
  counts: { open: number; closed: number; all: number };
  filter: "open" | "closed" | "all";
}) {
  const [composing, setComposing] = useState(false);

  if (composing) {
    return <NewRequestForm onCancel={() => setComposing(false)} />;
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight text-slate-900 dark:text-white">
            Service requests
          </h1>
          <p className="mt-1 text-[14px] text-slate-500 dark:text-slate-400">
            Something wrong with EduPilot? Tell us here and follow what happens.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setComposing(true)}
          className="shrink-0 rounded-lg bg-blue-600 px-4 py-2.5 text-[14px] font-semibold text-white transition hover:bg-blue-700"
        >
          Raise a request
        </button>
      </header>

      <nav aria-label="Filter" className="flex flex-wrap gap-1.5">
        {(
          [
            ["open", "Open", counts.open],
            ["closed", "Closed", counts.closed],
            ["all", "All", counts.all],
          ] as const
        ).map(([key, label, count]) => (
          <Link
            key={key}
            href={`/service-requests?filter=${key}`}
            aria-current={key === filter ? "page" : undefined}
            className={`rounded-full px-3 py-1.5 text-[13px] font-medium transition ${
              key === filter
                ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                : "border border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            }`}
          >
            {label} {count > 0 && <span className="tabular-nums">({count})</span>}
          </Link>
        ))}
      </nav>

      {initial.length ? (
        <ul className="space-y-2.5">
          {initial.map((card) => (
            <li key={card.id}>
              <Link
                href={`/service-requests/${card.id}`}
                className="group block rounded-2xl border border-slate-200/80 bg-white p-4 transition hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2">
                      <span className="truncate text-[14.5px] font-semibold text-slate-900 group-hover:underline dark:text-white">
                        {card.subject}
                      </span>
                      {card.unread > 0 && (
                        <span
                          className="h-2 w-2 shrink-0 rounded-full bg-blue-600"
                          aria-label="Unread update"
                        />
                      )}
                    </p>
                    <p className="mt-0.5 truncate text-[12.5px] text-slate-400 dark:text-slate-500">
                      {card.ticket} · {card.categoryLabel} · {card.typeLabel}
                    </p>
                  </div>

                  <span
                    className={`shrink-0 rounded-full px-2.5 py-1 text-[11.5px] font-semibold ${TONES[card.status]}`}
                  >
                    {card.statusLabel}
                  </span>
                </div>

                <p className="mt-2 text-[12.5px] text-slate-400 dark:text-slate-500">
                  {card.overdue ? (
                    /* Said plainly. A student who can see it is late does not
                       have to ask whether they have been forgotten. */
                    <span className="font-semibold text-amber-600 dark:text-amber-400">
                      Past its target date
                    </span>
                  ) : card.targetAt ? (
                    `Expected by ${formatDate(card.targetAt)}`
                  ) : (
                    `Updated ${formatDate(card.updatedAt)}`
                  )}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <div className="rounded-2xl border border-slate-200/80 bg-white p-8 text-center dark:border-slate-800 dark:bg-slate-900">
          <p className="text-[15px] font-semibold text-slate-900 dark:text-white">
            {filter === "open" ? "Nothing open" : "Nothing here"}
          </p>
          <p className="mx-auto mt-1 max-w-sm text-[13.5px] text-slate-500 dark:text-slate-400">
            Cannot sign in, a payment missing, subjects that look wrong? Tell us and we will
            look into it.
          </p>
        </div>
      )}
    </div>
  );
}

// ── New request ───────────────────────────────────────────────────────────

function NewRequestForm({ onCancel }: { onCancel: () => void }) {
  const router = useRouter();
  const [category, setCategory] = useState<RequestCategory | "">("");
  const [type, setType] = useState("");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const types = useMemo(() => (category ? REQUEST_TYPES[category] : []), [category]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy || !category || !type) return;

    setBusy(true);
    setError(null);

    try {
      const response = await fetch("/api/service-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, type, subject, description }),
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        setError(payload?.error?.message ?? "That could not be raised. Try again.");
        return;
      }

      router.refresh();
      router.push(`/service-requests/${payload.data.id}`);
    } catch {
      setError("The connection dropped. Check your network and try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="mx-auto w-full max-w-3xl space-y-5">
      <header>
        <h1 className="text-[22px] font-semibold tracking-tight text-slate-900 dark:text-white">
          Raise a request
        </h1>
        <p className="mt-1 text-[14px] text-slate-500 dark:text-slate-400">
          Tell us what is wrong and we will get it to the right person.
        </p>
      </header>

      {error && (
        <p
          role="alert"
          className="rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-[13px] text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200"
        >
          {error}
        </p>
      )}

      <section className="rounded-2xl border border-slate-200/80 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <p className="text-[12.5px] font-semibold text-slate-600 dark:text-slate-300">
          What is it about?
        </p>
        <div className="mt-2.5 grid gap-2 sm:grid-cols-2">
          {REQUEST_CATEGORIES.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => {
                setCategory(key);
                setType("");
              }}
              className={`rounded-xl border p-3 text-left transition ${
                category === key
                  ? "border-blue-600 bg-blue-50 dark:border-blue-500 dark:bg-blue-500/10"
                  : "border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
              }`}
            >
              <span className="block text-[14px] font-semibold text-slate-900 dark:text-white">
                {CATEGORY_LABELS[key]}
              </span>
              <span className="mt-0.5 block text-[12.5px] text-slate-500 dark:text-slate-400">
                {CATEGORY_BLURBS[key]}
              </span>
            </button>
          ))}
        </div>

        {category && (
          <>
            <label
              htmlFor="sr-type"
              className="mt-5 block text-[12.5px] font-semibold text-slate-600 dark:text-slate-300"
            >
              Which one?
            </label>
            <select
              id="sr-type"
              required
              value={type}
              onChange={(event) => setType(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-[14px] text-slate-700 outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              <option value="">Choose one</option>
              {types.map((entry) => (
                <option key={entry.key} value={entry.key}>
                  {entry.label}
                </option>
              ))}
            </select>

            {/* The target is stated before they commit, so "how long will this
                take" is answered without anyone having to ask. */}
            <p className="mt-2 text-[12.5px] text-slate-400 dark:text-slate-500">
              These usually take about {TARGET_DAYS[category]} working{" "}
              {TARGET_DAYS[category] === 1 ? "day" : "days"}.
            </p>
          </>
        )}
      </section>

      <section className="space-y-4 rounded-2xl border border-slate-200/80 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <div>
          <label
            htmlFor="sr-subject"
            className="block text-[12.5px] font-semibold text-slate-600 dark:text-slate-300"
          >
            One line about it
          </label>
          <input
            id="sr-subject"
            required
            maxLength={REQUEST_LIMITS.subjectMax}
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
            placeholder="My wallet top-up has not shown up"
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-[14px] text-slate-900 outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
          />
        </div>

        <div>
          <label
            htmlFor="sr-description"
            className="block text-[12.5px] font-semibold text-slate-600 dark:text-slate-300"
          >
            Everything we need to know
          </label>
          <textarea
            id="sr-description"
            required
            rows={6}
            maxLength={REQUEST_LIMITS.descriptionMax}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="When it happened, what you were doing, any error message, what you have already tried — anything that saves us coming back to ask."
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-[14px] text-slate-900 outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
          />
          <p className="mt-1 text-right text-[12px] text-slate-400 tabular-nums dark:text-slate-500">
            {description.length}/{REQUEST_LIMITS.descriptionMax}
          </p>
        </div>
      </section>

      <div className="flex flex-wrap gap-2.5">
        <button
          type="submit"
          disabled={busy || !category || !type || subject.trim().length < 4 || description.trim().length < 10}
          className="rounded-lg bg-blue-600 px-5 py-2.5 text-[14px] font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? "Raising…" : "Raise request"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-slate-200 px-4 py-2.5 text-[14px] font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

// ── Detail ────────────────────────────────────────────────────────────────

type Detail = Card & {
  description: string;
  resolution: string | null;
  resolutionAttachments: { fileId: string; fileName: string; size: number }[];
  canCancel: boolean;
  timeline: {
    id: string;
    kind: string;
    actorKind: "student" | "staff" | "system";
    actorName: string | null;
    body: string | null;
    toValue: string | null;
    attachments: { fileId: string; fileName: string; size: number }[];
    createdAt: string;
  }[];
};

export function ServiceRequestDetail({ request }: { request: Detail }) {
  const router = useRouter();
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const act = async (path: string, body?: unknown) => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/service-requests/${request.id}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        setError(payload?.error?.message ?? "That did not work. Try again.");
        return false;
      }
      setReply("");
      router.refresh();
      return true;
    } catch {
      setError("The connection dropped. Check your network and try again.");
      return false;
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5">
      <nav className="text-[13px] text-slate-400">
        <Link href="/service-requests" className="transition hover:text-slate-600 dark:hover:text-slate-300">
          Service requests
        </Link>
        <span className="mx-1.5">/</span>
        <span className="text-slate-500 dark:text-slate-400">{request.ticket}</span>
      </nav>

      <header className="rounded-2xl border border-slate-200/80 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-[20px] font-semibold tracking-tight text-slate-900 dark:text-white">
              {request.subject}
            </h1>
            <p className="mt-1 text-[12.5px] text-slate-400 dark:text-slate-500">
              {request.ticket} · {request.categoryLabel} · {request.typeLabel}
            </p>
          </div>
          <span
            className={`shrink-0 rounded-full px-2.5 py-1 text-[11.5px] font-semibold ${TONES[request.status]}`}
          >
            {request.statusLabel}
          </span>
        </div>

        <p className="mt-3 rounded-lg bg-slate-50 px-3.5 py-2.5 text-[13px] leading-relaxed text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">
          {STATUS_BLURBS[request.status]}
          {request.targetAt && !["resolved", "rejected", "cancelled"].includes(request.status) && (
            <>
              {" "}
              {request.overdue ? (
                <span className="font-semibold text-amber-700 dark:text-amber-300">
                  This is past its target date of {formatDate(request.targetAt)}.
                </span>
              ) : (
                <>Expected by {formatDate(request.targetAt)}.</>
              )}
            </>
          )}
        </p>

        <p className="mt-4 whitespace-pre-wrap text-[14px] leading-relaxed text-slate-700 dark:text-slate-200">
          {request.description}
        </p>
      </header>

      {request.resolution && (
        <section
          className={`rounded-2xl border p-5 ${
            request.status === "rejected"
              ? "border-rose-200 bg-rose-50 dark:border-rose-500/30 dark:bg-rose-500/10"
              : "border-emerald-200 bg-emerald-50 dark:border-emerald-500/30 dark:bg-emerald-500/10"
          }`}
        >
          <p className="text-[12.5px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            {request.status === "rejected" ? "Why this was declined" : "Outcome"}
          </p>
          <p className="mt-1.5 whitespace-pre-wrap text-[14px] leading-relaxed text-slate-800 dark:text-slate-100">
            {request.resolution}
          </p>

          {request.resolutionAttachments.length > 0 && (
            <ul className="mt-3 space-y-1.5">
              {request.resolutionAttachments.map((file) => (
                <li key={file.fileId}>
                  {/* Through the permission-checked download route, never a
                      public URL — a file attached to somebody's support
                      request has no business on a guessable path. */}
                  <a
                    href={`/api/files/${file.fileId}`}
                    className="text-[13.5px] font-semibold text-blue-700 underline dark:text-blue-400"
                  >
                    {file.fileName}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <section className="rounded-2xl border border-slate-200/80 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-[16px] font-semibold text-slate-900 dark:text-white">History</h2>

        <ol className="mt-3 space-y-3.5">
          {request.timeline.map((entry) => (
            <li key={entry.id} className="flex gap-3">
              <span
                className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                  entry.actorKind === "staff" ? "bg-blue-600" : "bg-slate-300 dark:bg-slate-600"
                }`}
              />
              <div className="min-w-0 flex-1">
                <p className="text-[12.5px] text-slate-400 dark:text-slate-500">
                  {entry.actorKind === "staff"
                    ? "EduPilot support"
                    : entry.actorKind === "student"
                      ? "You"
                      : "System"}{" "}
                  · {formatDateTime(entry.createdAt)}
                </p>
                {entry.body && (
                  <p className="mt-0.5 whitespace-pre-wrap text-[14px] leading-relaxed text-slate-700 dark:text-slate-200">
                    {entry.body}
                  </p>
                )}
                {!entry.body && entry.toValue && (
                  <p className="mt-0.5 text-[14px] text-slate-700 dark:text-slate-200">
                    Moved to <strong>{entry.toValue.replace(/_/g, " ")}</strong>
                  </p>
                )}
                {entry.attachments.map((file) => (
                  <a
                    key={file.fileId}
                    href={`/api/files/${file.fileId}`}
                    className="mt-1 block text-[13px] font-medium text-blue-700 underline dark:text-blue-400"
                  >
                    {file.fileName}
                  </a>
                ))}
              </div>
            </li>
          ))}
        </ol>

        {error && (
          <p
            role="alert"
            className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-[13px] text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200"
          >
            {error}
          </p>
        )}

        {request.canCancel ? (
          <div className="mt-4 border-t border-slate-100 pt-4 dark:border-slate-800">
            <label htmlFor="sr-reply" className="sr-only">
              Add a reply
            </label>
            <textarea
              id="sr-reply"
              rows={3}
              maxLength={REQUEST_LIMITS.commentMax}
              value={reply}
              onChange={(event) => setReply(event.target.value)}
              placeholder={
                request.status === "awaiting_student"
                  ? "We are waiting on you — reply here."
                  : "Add anything else that might help."
              }
              className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-[14px] text-slate-900 outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />

            <div className="mt-2.5 flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                disabled={busy || !reply.trim()}
                onClick={() => void act("/comments", { body: reply.trim() })}
                className="rounded-lg bg-blue-600 px-4 py-2 text-[13.5px] font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50"
              >
                {busy ? "Sending…" : "Send reply"}
              </button>

              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  if (
                    window.confirm(
                      "Cancel this request?\n\nIt will be closed and we will stop working on it. You can raise a new one at any time."
                    )
                  ) {
                    void act("/cancel");
                  }
                }}
                className="rounded-lg px-3 py-2 text-[13.5px] font-medium text-slate-500 transition hover:bg-slate-100 disabled:opacity-50 dark:text-slate-400 dark:hover:bg-slate-800"
              >
                Cancel request
              </button>
            </div>
          </div>
        ) : (
          <p className="mt-4 border-t border-slate-100 pt-4 text-[13px] text-slate-500 dark:border-slate-800 dark:text-slate-400">
            This request is closed. Raise a new one if you still need help.
          </p>
        )}
      </section>
    </div>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}
