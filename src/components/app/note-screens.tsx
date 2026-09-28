"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  BookIcon,
  ChevronRightIcon,
  FileTextIcon,
  PaperclipIcon,
} from "@/components/icons";
import { FileLink } from "@/components/app/assignment-detail";
import { APP_ROUTES } from "@/lib/app-routes";
import type { StudentNoteCard, StudentNoteDetail } from "@/lib/teaching/student-view";

/**
 * The student's notes list and one note (§32, §33, §70).
 *
 * A client component only because of the bookmark toggle. Everything else is
 * server-rendered from props — the tabs are links, the content arrives with the
 * page, and the one interactive control is the star.
 *
 * Notes lead with the **subject**, not the title: a student looking for their
 * operating systems material is scanning for "Operating Systems", and the note
 * titles a teacher writes ("Unit 3 part 2") are rarely what anyone searches by.
 */

const TABS = [
  { key: "all", label: "All" },
  { key: "bookmarked", label: "Saved" },
] as const;

export function NoteList({
  cards,
  filter,
}: {
  cards: StudentNoteCard[];
  filter: string;
}) {
  return (
    <div className="mx-auto max-w-4xl">
      <header>
        <h1 className="text-[24px] font-bold tracking-tight text-slate-900 dark:text-white">
          Notes
        </h1>
        <p className="mt-1 text-[14px] text-slate-500 dark:text-slate-400">
          Lecture notes and study material shared by your teachers.
        </p>
      </header>

      <nav aria-label="Filter notes" className="mt-5 flex flex-wrap gap-1.5">
        {TABS.map((tab) => {
          const active = tab.key === filter;
          return (
            <Link
              key={tab.key}
              href={tab.key === "all" ? APP_ROUTES.notes : `${APP_ROUTES.notes}?filter=${tab.key}`}
              aria-current={active ? "page" : undefined}
              className={`rounded-full px-3 py-1.5 text-[13px] font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 ${
                active
                  ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                  : "border border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>

      {cards.length === 0 ? (
        <div className="mt-4 rounded-2xl border border-slate-200/80 bg-white p-10 text-center dark:border-slate-800 dark:bg-slate-900">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-slate-100 text-slate-400 dark:bg-slate-800">
            <FileTextIcon className="h-6 w-6" />
          </span>
          <p className="mt-3.5 text-[15px] font-semibold text-slate-800 dark:text-slate-100">
            {filter === "bookmarked" ? "Nothing saved yet" : "No notes yet"}
          </p>
          <p className="mx-auto mt-1.5 max-w-sm text-[13.5px] leading-relaxed text-slate-500 dark:text-slate-400">
            {filter === "bookmarked"
              ? "Star a note to keep it here for revision."
              : "No notes have been shared for your current subjects yet. You will get a notification when a teacher publishes some."}
          </p>
        </div>
      ) : (
        <ul className="mt-4 space-y-2.5">
          {cards.map((card) => (
            <li key={card.id}>
              <Link
                href={`${APP_ROUTES.notes}/${card.id}`}
                className="flex items-start gap-3.5 rounded-xl border border-slate-200/80 bg-white p-4 transition hover:border-blue-300 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-blue-500/40"
              >
                <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400">
                  <NoteGlyph type={card.noteType} />
                </span>

                <span className="min-w-0 flex-1">
                  <span className="block text-[12.5px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                    {card.subjectCode ? `${card.subjectCode} · ` : ""}
                    {card.subjectName ?? "Subject"}
                  </span>
                  <span className="mt-0.5 block text-[15px] font-semibold leading-snug text-slate-900 dark:text-white">
                    {card.title}
                  </span>
                  <span className="mt-1 flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[12.5px] text-slate-500 dark:text-slate-400">
                    {card.teacherName && <span>{card.teacherName}</span>}
                    {card.topicTitle && <span>{card.topicTitle}</span>}
                    {card.attachmentCount > 0 && (
                      <span className="inline-flex items-center gap-1">
                        <PaperclipIcon className="h-3.5 w-3.5" />
                        {card.attachmentCount}
                      </span>
                    )}
                    {card.publishedAt && <span>{formatDate(card.publishedAt)}</span>}
                  </span>
                </span>

                <span className="flex shrink-0 items-center gap-2">
                  {/*
                    Unread is marked with a dot *and* the row's bolder title, so
                    the distinction is not carried by a coloured dot alone.
                  */}
                  {!card.viewedAt && (
                    <span
                      aria-label="Not read yet"
                      className="h-2 w-2 rounded-full bg-blue-500"
                    />
                  )}
                  {card.bookmarked && <StarGlyph filled />}
                  <ChevronRightIcon className="h-4 w-4 text-slate-300 dark:text-slate-600" />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function NoteDetail({ note }: { note: StudentNoteDetail }) {
  const router = useRouter();
  const [bookmarked, setBookmarked] = useState(note.bookmarked);
  const [pending, startTransition] = useTransition();

  async function toggle() {
    // Optimistic, then reconciled with the server's answer. A star that waits
    // for a round trip on a slow connection feels broken.
    const next = !bookmarked;
    setBookmarked(next);

    try {
      const response = await fetch(`/api/student/notes/${note.id}/bookmark`, { method: "POST" });
      const payload = (await response.json().catch(() => null)) as
        | { data?: { bookmarked?: boolean } }
        | null;

      if (payload?.data?.bookmarked !== undefined) setBookmarked(payload.data.bookmarked);
      startTransition(() => router.refresh());
    } catch {
      setBookmarked(!next);
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-[13px] text-slate-400">
        <Link href={APP_ROUTES.notes} className="transition hover:text-slate-600 dark:hover:text-slate-300">
          Notes
        </Link>
        <ChevronRightIcon className="h-3.5 w-3.5" />
        <span className="truncate text-slate-500 dark:text-slate-400">{note.subjectCode}</span>
      </nav>

      <header className="mt-5 rounded-2xl border border-slate-200/80 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[12.5px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
              {note.subjectCode ? `${note.subjectCode} · ` : ""}
              {note.subjectName ?? "Subject"}
            </p>
            <h1 className="mt-1 text-[23px] font-bold leading-tight tracking-tight text-slate-900 dark:text-white">
              {note.title}
            </h1>
          </div>

          <button
            type="button"
            onClick={toggle}
            disabled={pending}
            aria-pressed={bookmarked}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-[13px] font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <StarGlyph filled={bookmarked} />
            {bookmarked ? "Saved" : "Save"}
          </button>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[13px] text-slate-500 dark:text-slate-400">
          {note.teacherName && <span>{note.teacherName}</span>}
          {note.topicTitle && <span>{note.topicTitle}</span>}
          {note.publishedAt && <span>{formatDate(note.publishedAt)}</span>}
        </div>

        {note.description && (
          <p className="mt-3.5 text-[14.5px] leading-relaxed text-slate-600 dark:text-slate-300">
            {note.description}
          </p>
        )}
      </header>

      {note.content && (
        <section className="mt-4 rounded-2xl border border-slate-200/80 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
          <div className="space-y-3">
            {/*
              Plain paragraphs, never `dangerouslySetInnerHTML`. This text was
              typed by a teacher into a form — rendering it as HTML would make
              every teacher account a stored-XSS vector against their own
              students.
            */}
            {note.content.split(/\n{2,}/).map((paragraph, index) => (
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

      {note.attachments.length > 0 && (
        <section className="mt-4 rounded-2xl border border-slate-200/80 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="text-[15px] font-semibold text-slate-900 dark:text-white">Files</h2>
          <ul className="mt-2.5 space-y-1.5">
            {note.attachments.map((file) => (
              <li key={file.fileId}>
                <FileLink file={file} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {note.externalLinks.length > 0 && (
        <section className="mt-4 rounded-2xl border border-slate-200/80 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="text-[15px] font-semibold text-slate-900 dark:text-white">Links</h2>
          <ul className="mt-2.5 space-y-1.5">
            {note.externalLinks.map((link) => (
              <li key={link.url}>
                <a
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="block truncate text-[13.5px] text-blue-600 hover:underline dark:text-blue-400"
                >
                  {link.label || link.url}
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      {note.topicId && (
        <Link
          href={`${APP_ROUTES.curriculum}/${note.subjectId}/topics/${note.topicId}`}
          className="mt-4 flex items-center gap-2 rounded-xl border border-slate-200/80 bg-white px-4 py-3 text-[13.5px] font-medium text-slate-700 transition hover:border-blue-300 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
        >
          <BookIcon className="h-4 w-4 text-slate-400" />
          Read the topic these cover
          <ChevronRightIcon className="ml-auto h-4 w-4 text-slate-400" />
        </Link>
      )}
    </div>
  );
}

function NoteGlyph({ type }: { type: string }) {
  if (type === "text") return <FileTextIcon className="h-[18px] w-[18px]" />;
  if (type === "link") return <ChevronRightIcon className="h-[18px] w-[18px]" />;
  return <PaperclipIcon className="h-[18px] w-[18px]" />;
}

function StarGlyph({ filled }: { filled: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m12 3.6 2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.5 9.8l5.9-.9Z" />
    </svg>
  );
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(iso));
}
