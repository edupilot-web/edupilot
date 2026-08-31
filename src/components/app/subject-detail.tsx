"use client";

import Link from "next/link";
import { useState } from "react";
import {
  BookIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ClockIcon,
  FileTextIcon,
} from "@/components/icons";
import { APP_ROUTES } from "@/lib/app-routes";
import type { SubjectUnit, SubjectView } from "@/lib/curriculum/student-curriculum";

/**
 * One subject: its syllabus units, and the textbook reading mapped onto each.
 *
 * The unit is the heading and the book sits inside it — not the other way round.
 * The exam follows the syllabus, so that is the structure a student needs to
 * revise against; the book is how they cover it. It is also the order the data
 * enforces, since generated content is addressed by unit and topic number.
 */
export function SubjectDetail({ subject }: { subject: SubjectView }) {
  // The first unit starts open. Everything collapsed is a wall of chevrons that
  // tells a new visitor nothing about what is behind them.
  const [open, setOpen] = useState<Set<number>>(
    () => new Set(subject.units.length ? [subject.units[0].unitNumber] : [])
  );

  function toggle(unitNumber: number) {
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(unitNumber)) next.delete(unitNumber);
      else next.add(unitNumber);
      return next;
    });
  }

  const allOpen = open.size === subject.units.length && subject.units.length > 0;

  return (
    <div className="mx-auto max-w-4xl">
      <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-[13px] text-slate-400">
        <Link
          href={APP_ROUTES.dashboard}
          className="transition hover:text-slate-600 dark:hover:text-slate-300"
        >
          Dashboard
        </Link>
        <ChevronRightIcon className="h-3.5 w-3.5" />
        <Link
          href={APP_ROUTES.curriculum}
          className="transition hover:text-slate-600 dark:hover:text-slate-300"
        >
          Curriculum
        </Link>
        <ChevronRightIcon className="h-3.5 w-3.5" />
        <span className="truncate text-slate-500 dark:text-slate-400">{subject.code}</span>
      </nav>

      <header className="mt-5 rounded-2xl border border-slate-200/80 bg-white p-6 shadow-[0_1px_3px_rgba(15,23,42,0.04)] dark:border-slate-800 dark:bg-slate-900">
        <p className="font-mono text-[12.5px] font-semibold tracking-wide text-slate-400 dark:text-slate-500">
          {subject.code}
        </p>
        <h1 className="mt-1 text-[24px] font-bold leading-tight tracking-tight text-slate-900 dark:text-white">
          {subject.name}
        </h1>

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[13px] text-slate-500 dark:text-slate-400">
          <span>{subject.courseType}</span>
          {subject.credits !== null && <span>{formatCredits(subject.credits)} credits</span>}
          {ltp(subject) && <span>L-T-P {ltp(subject)}</span>}
          <span>
            Year {subject.year} · Semester {subject.semester}
          </span>
        </div>

        {subject.prerequisites.length > 0 && (
          <p className="mt-3 text-[13px] text-slate-500 dark:text-slate-400">
            <span className="font-semibold text-slate-600 dark:text-slate-300">Prerequisites:</span>{" "}
            {subject.prerequisites.join(", ")}
          </p>
        )}
      </header>

      {subject.books.length > 0 && <Books subject={subject} />}

      {subject.units.length > 0 ? (
        <section className="mt-6">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-[16px] font-semibold text-slate-900 dark:text-white">Syllabus</h2>
            <button
              type="button"
              onClick={() =>
                setOpen(allOpen ? new Set() : new Set(subject.units.map((unit) => unit.unitNumber)))
              }
              className="rounded-md text-[13px] font-semibold text-blue-600 transition hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 dark:text-blue-400"
            >
              {allOpen ? "Collapse all" : "Expand all"}
            </button>
          </div>

          <ol className="mt-3 space-y-3">
            {subject.units.map((unit) => (
              <li key={unit.unitNumber}>
                <Unit
                  unit={unit}
                  open={open.has(unit.unitNumber)}
                  onToggle={() => toggle(unit.unitNumber)}
                />
              </li>
            ))}
          </ol>
        </section>
      ) : (
        <section className="mt-6 rounded-2xl border border-slate-200/80 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="text-[16px] font-semibold text-slate-900 dark:text-white">Syllabus</h2>
          <p className="mt-2 whitespace-pre-line text-[14px] leading-relaxed text-slate-600 dark:text-slate-300">
            {subject.syllabusText ??
              "This subject is not broken into units yet. Once its syllabus is added, the units and topics will appear here."}
          </p>
        </section>
      )}

      {(subject.learningObjectives.length > 0 || subject.outcomes.length > 0) && (
        <section className="mt-6 grid gap-3 sm:grid-cols-2">
          {subject.learningObjectives.length > 0 && (
            <List title="Objectives" items={subject.learningObjectives} />
          )}
          {subject.outcomes.length > 0 && <List title="Outcomes" items={subject.outcomes} />}
        </section>
      )}

      {subject.furtherReading.length > 0 && (
        <section className="mt-6 rounded-2xl border border-slate-200/80 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="text-[16px] font-semibold text-slate-900 dark:text-white">
            Further reading
          </h2>
          <p className="mt-1 text-[12.5px] text-slate-400 dark:text-slate-500">
            Named on the syllabus, not yet in our library — so there are no chapters to open.
          </p>
          <ul className="mt-3 space-y-2">
            {subject.furtherReading.map((book) => (
              <li
                key={`${book.title}-${book.authors ?? ""}`}
                className="text-[13.5px] text-slate-600 dark:text-slate-300"
              >
                {book.title}
                {book.authors && (
                  <span className="text-slate-400 dark:text-slate-500"> — {book.authors}</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function Books({ subject }: { subject: SubjectView }) {
  return (
    <section className="mt-6">
      <h2 className="text-[16px] font-semibold text-slate-900 dark:text-white">Textbooks</h2>
      <ul className="mt-3 space-y-2.5">
        {subject.books.map((book) => (
          <li
            key={book.id}
            className="flex items-start gap-3 rounded-xl border border-slate-200/80 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
          >
            <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400">
              <BookIcon className="h-[18px] w-[18px]" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-[14.5px] font-semibold text-slate-900 dark:text-white">
                  {book.title}
                </h3>
                {book.isPrimary && (
                  <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700 dark:bg-blue-500/10 dark:text-blue-300">
                    Primary
                  </span>
                )}
                {!book.isPrimary && (
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold capitalize text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    {book.role}
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-[13px] text-slate-500 dark:text-slate-400">
                {[book.authors.join(", "), book.publisher, book.edition && `${book.edition} ed`, book.year]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              <p className="mt-1.5 text-[12.5px] text-slate-400 dark:text-slate-500">
                Covers {book.unitsCovered} of {subject.units.length} units
                {book.coveragePercent !== null && ` · about ${book.coveragePercent}% of the syllabus`}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Unit({
  unit,
  open,
  onToggle,
}: {
  unit: SubjectUnit;
  open: boolean;
  onToggle: () => void;
}) {
  const panelId = `unit-${unit.unitNumber}`;
  const readingMinutes = unit.reading.reduce(
    (total, entry) =>
      total + entry.topics.reduce((sum, topic) => sum + (topic.estimatedMinutes ?? 0), 0),
    0
  );

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.04)] dark:border-slate-800 dark:bg-slate-900">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex w-full items-start gap-3 p-5 text-left transition hover:bg-slate-50/70 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-blue-500/20 dark:hover:bg-slate-800/40"
      >
        <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-slate-100 text-[12.5px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
          {unit.unitNumber}
        </span>

        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold text-slate-900 dark:text-white">
            {unit.title}
          </span>
          <span className="mt-1 flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[12.5px] text-slate-500 dark:text-slate-400">
            {unit.syllabusTopics.length > 0 && (
              <span className="flex items-center gap-1.5">
                <FileTextIcon className="h-3.5 w-3.5" />
                {unit.syllabusTopics.length} syllabus topics
              </span>
            )}
            {unit.reading.length > 0 && (
              <span className="flex items-center gap-1.5">
                <BookIcon className="h-3.5 w-3.5" />
                {unit.reading.reduce((total, entry) => total + entry.topics.length, 0)} to read
              </span>
            )}
            {readingMinutes > 0 && (
              <span className="flex items-center gap-1.5">
                <ClockIcon className="h-3.5 w-3.5" />~{(readingMinutes / 60).toFixed(1)}h
              </span>
            )}
            {unit.hours !== null && <span>{unit.hours} class hours</span>}
          </span>
        </span>

        <ChevronDownIcon
          className={`mt-1 h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div id={panelId} className="border-t border-slate-100 px-5 pb-5 pt-4 dark:border-slate-800">
          {unit.description && (
            <p className="text-[13.5px] leading-relaxed text-slate-600 dark:text-slate-300">
              {unit.description}
            </p>
          )}

          {unit.syllabusTopics.length > 0 && (
            <div className={unit.description ? "mt-4" : ""}>
              <h4 className="text-[12px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                On the syllabus
              </h4>
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {unit.syllabusTopics.map((topic) => (
                  <li
                    key={topic}
                    className="rounded-md bg-slate-100 px-2.5 py-1 text-[12.5px] text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                  >
                    {topic}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {unit.reading.length > 0 ? (
            unit.reading.map((entry) => (
              <div key={`${entry.bookId}-${unit.unitNumber}`} className="mt-5">
                <h4 className="text-[12px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                  Read in {entry.bookTitle}
                </h4>

                {entry.chapters.length > 0 && (
                  <p className="mt-1.5 text-[13px] font-medium text-slate-600 dark:text-slate-300">
                    {entry.chapters
                      .map((chapter) => `Chapter ${chapter.chapterNumber} — ${chapter.title}`)
                      .join("  ·  ")}
                  </p>
                )}
                {entry.note && (
                  <p className="mt-1 text-[12.5px] italic text-slate-400 dark:text-slate-500">
                    {entry.note}
                  </p>
                )}

                <ul className="mt-2.5 divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200/70 dark:divide-slate-800 dark:border-slate-800">
                  {entry.topics.map((topic) => (
                    <li
                      key={topic.id}
                      className="flex items-center gap-3 px-3.5 py-2.5 text-[13.5px] transition hover:bg-slate-50/70 dark:hover:bg-slate-800/40"
                    >
                      <span className="w-10 shrink-0 font-mono text-[12px] text-slate-400 dark:text-slate-500">
                        {topic.label}
                      </span>
                      <span className="min-w-0 flex-1 text-slate-700 dark:text-slate-200">
                        {topic.title}
                      </span>
                      <DifficultyDot difficulty={topic.difficulty} />
                      {topic.estimatedMinutes !== null && (
                        <span className="w-12 shrink-0 text-right text-[12px] text-slate-400 dark:text-slate-500">
                          {topic.estimatedMinutes}m
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))
          ) : (
            <p className="mt-5 rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-[12.5px] text-slate-500 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-400">
              No textbook chapters mapped to this unit yet — the syllabus topics above are the scope.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function DifficultyDot({ difficulty }: { difficulty: string }) {
  const styles =
    difficulty === "advanced"
      ? "bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-300"
      : difficulty === "intermediate"
        ? "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300"
        : "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300";

  return (
    <span
      className={`hidden shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium capitalize sm:inline ${styles}`}
    >
      {difficulty}
    </span>
  );
}

function List({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      <h3 className="text-[14.5px] font-semibold text-slate-900 dark:text-white">{title}</h3>
      <ul className="mt-2.5 space-y-1.5">
        {items.map((item) => (
          <li
            key={item}
            className="flex gap-2 text-[13px] leading-relaxed text-slate-600 dark:text-slate-300"
          >
            <span aria-hidden="true" className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-slate-300" />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** "3-1-0", or null when the curriculum did not state the hours. */
function ltp(subject: SubjectView): string | null {
  const { lectureHours, tutorialHours, practicalHours } = subject;
  if (lectureHours === null && tutorialHours === null && practicalHours === null) return null;
  return [lectureHours ?? 0, tutorialHours ?? 0, practicalHours ?? 0].join("-");
}

function formatCredits(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}
