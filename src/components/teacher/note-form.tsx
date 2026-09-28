"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { UsersIcon } from "@/components/icons";
import type { AcademicContextTree } from "@/lib/teaching/teacher";

/**
 * Sharing notes (§29, §61).
 *
 * Deliberately shorter than the assignment form. A note has no deadline, no
 * marks and no submission type — reusing the assignment form and hiding half
 * its fields would have meant a form that asks a teacher to ignore things,
 * which is how somebody eventually sets a due date on a PDF.
 *
 * The audience is the same, resolved the same way, from the same subject
 * choice: a teacher never picks students (§102).
 */
export function NoteForm({
  context,
  canPublish,
}: {
  context: AcademicContextTree;
  canPublish: boolean;
}) {
  const router = useRouter();

  const [subjectId, setSubjectId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [content, setContent] = useState("");
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const subjects = useMemo(() => flatten(context), [context]);
  const chosen = subjects.find((subject) => subject.subjectId === subjectId) ?? null;

  async function save(publish: boolean) {
    if (busy) return;
    setBusy(true);
    setError(null);

    try {
      const response = await fetch("/api/teacher/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subjectId,
          title,
          description: description || null,
          content: content || null,
          externalLinks: link.trim() ? [{ label: null, url: link.trim() }] : [],
        }),
      });

      const payload = (await response.json().catch(() => null)) as
        | { data?: { id?: string }; error?: { message?: string } }
        | null;

      if (!response.ok || !payload?.data?.id) {
        setError(payload?.error?.message ?? "Those notes could not be saved.");
        return;
      }

      const id = payload.data.id;

      if (!publish) {
        router.push("/teacher/notes");
        return;
      }

      const published = await fetch(`/api/teacher/notes/${id}/publish`, { method: "POST" });
      if (!published.ok) {
        const publishPayload = (await published.json().catch(() => null)) as
          | { error?: { message?: string } }
          | null;
        setError(
          `${publishPayload?.error?.message ?? "Those notes could not be published."} Your draft has been saved.`
        );
        return;
      }

      router.push("/teacher/notes");
    } catch {
      setError("The connection dropped. Check your network and try again.");
    } finally {
      setBusy(false);
    }
  }

  if (subjects.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200/80 bg-white p-8 text-center dark:border-slate-800 dark:bg-slate-900">
        <p className="text-[15px] font-semibold text-slate-900 dark:text-white">
          No subjects assigned
        </p>
        <p className="mx-auto mt-1.5 max-w-md text-[13.5px] leading-relaxed text-slate-500 dark:text-slate-400">
          Your college decides which subjects you teach. Until one is assigned there is nobody to
          share notes with.
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void save(false);
      }}
      className="space-y-5"
    >
      <section className="rounded-2xl border border-slate-200/80 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <label
          htmlFor="note-subject"
          className="block text-[12.5px] font-semibold text-slate-600 dark:text-slate-300"
        >
          Subject
        </label>
        <select
          id="note-subject"
          required
          value={subjectId}
          onChange={(event) => setSubjectId(event.target.value)}
          className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-[14px] text-slate-700 outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
        >
          <option value="">Choose a subject</option>
          {subjects.map((subject) => (
            <option key={subject.subjectId} value={subject.subjectId}>
              {subject.code} — {subject.name} (Year {subject.year}, Sem {subject.semester})
            </option>
          ))}
        </select>

        {chosen && (
          <p className="mt-2.5 flex items-start gap-2 rounded-lg bg-blue-50/60 px-3 py-2 text-[12.5px] leading-relaxed text-blue-900 dark:bg-blue-500/10 dark:text-blue-200">
            <UsersIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Every student currently in {chosen.branchName}, Year {chosen.year} Semester{" "}
            {chosen.semester} will get these notes.
          </p>
        )}
      </section>

      <section className="space-y-3 rounded-2xl border border-slate-200/80 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <div>
          <label
            htmlFor="note-title"
            className="block text-[12.5px] font-semibold text-slate-600 dark:text-slate-300"
          >
            Title
          </label>
          <input
            id="note-title"
            required
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Trees — lecture notes"
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-[14px] outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          />
        </div>

        <div>
          <label
            htmlFor="note-description"
            className="block text-[12.5px] font-semibold text-slate-600 dark:text-slate-300"
          >
            What is this?
          </label>
          <input
            id="note-description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="One line, so students know whether they need it."
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-[14px] outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          />
        </div>

        <div>
          <label
            htmlFor="note-content"
            className="block text-[12.5px] font-semibold text-slate-600 dark:text-slate-300"
          >
            Notes
          </label>
          <textarea
            id="note-content"
            rows={10}
            value={content}
            onChange={(event) => setContent(event.target.value)}
            placeholder="Type the notes here, or add a link below."
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-[14px] outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          />
        </div>

        <div>
          <label
            htmlFor="note-link"
            className="block text-[12.5px] font-semibold text-slate-600 dark:text-slate-300"
          >
            Link
          </label>
          <input
            id="note-link"
            type="url"
            value={link}
            onChange={(event) => setLink(event.target.value)}
            placeholder="https://"
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-[14px] outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          />
        </div>

        <p className="text-[12px] leading-relaxed text-slate-400">
          {/*
            File uploads need a configured storage driver. Saying so is better
            than a picker that accepts a file and loses it.
          */}
          File attachments need storage to be configured on this deployment. Typed notes and links
          work everywhere.
        </p>
      </section>

      {error && (
        <p role="alert" className="rounded-lg bg-rose-50 px-3.5 py-2.5 text-[13.5px] text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-2.5">
        <button
          type="submit"
          disabled={busy || !subjectId || !title.trim()}
          className="rounded-lg border border-slate-200 px-4 py-2.5 text-[14px] font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          {busy ? "Saving..." : "Save as draft"}
        </button>

        <button
          type="button"
          disabled={busy || !canPublish || !subjectId || !title.trim()}
          onClick={() => void save(true)}
          className="rounded-lg bg-blue-600 px-5 py-2.5 text-[14px] font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-500/25"
        >
          {busy ? "Working..." : "Save and publish"}
        </button>
      </div>
    </form>
  );
}

function flatten(context: AcademicContextTree) {
  const out: {
    subjectId: string;
    name: string;
    code: string;
    branchName: string;
    year: number;
    semester: number;
  }[] = [];

  for (const program of context.programs) {
    for (const branch of program.branches) {
      for (const regulation of branch.regulations) {
        for (const semester of regulation.semesters) {
          for (const subject of semester.subjects) {
            out.push({
              subjectId: subject.subjectId,
              name: subject.name,
              code: subject.code,
              branchName: branch.branchName,
              year: semester.year,
              semester: semester.semester,
            });
          }
        }
      }
    }
  }

  return out;
}
