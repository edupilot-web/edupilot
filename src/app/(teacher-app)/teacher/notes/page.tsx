import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { FileTextIcon, PlusIcon } from "@/components/icons";
import { TEACHER_ROUTES } from "@/lib/app-routes";
import { NOTE_STATUS_LABELS, type NoteStatus } from "@/lib/teaching/fields";
import { getCurrentTeacher } from "@/lib/teaching/teacher";
import { listTeacherNotes } from "@/lib/teaching/teacher-view";
import { NoteActions } from "@/components/teacher/note-actions";

export const metadata: Metadata = { title: "Notes · EduPilot for teachers" };

/**
 * The teacher's notes, with their engagement (§46, §47).
 *
 * "164 views by 78 students" and "164 views by 164 students" are different
 * facts, and the second is the one a teacher acts on — so both numbers are
 * shown rather than a single view count that cannot distinguish them.
 */
export default async function Page() {
  const teacher = await getCurrentTeacher();
  if (!teacher) redirect("/teacher/login");

  const { rows } = await listTeacherNotes(teacher, {});

  return (
    <div className="mx-auto max-w-5xl">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[24px] font-bold tracking-tight text-slate-900 dark:text-white">
            Notes
          </h1>
          <p className="mt-1 text-[14px] text-slate-500 dark:text-slate-400">
            Study material you have shared with your classes.
          </p>
        </div>

        <Link
          href={`${TEACHER_ROUTES.notes}/create`}
          className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2.5 text-[14px] font-semibold text-white transition hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-500/25"
        >
          <PlusIcon className="h-4 w-4" />
          Share notes
        </Link>
      </header>

      {rows.length === 0 ? (
        <div className="mt-5 rounded-2xl border border-slate-200/80 bg-white p-10 text-center dark:border-slate-800 dark:bg-slate-900">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-slate-100 text-slate-400 dark:bg-slate-800">
            <FileTextIcon className="h-6 w-6" />
          </span>
          <p className="mt-3.5 text-[15px] font-semibold text-slate-800 dark:text-slate-100">
            No notes shared yet
          </p>
          <p className="mx-auto mt-1.5 max-w-sm text-[13.5px] leading-relaxed text-slate-500 dark:text-slate-400">
            Share lecture notes or reference material and every student taking that subject will
            get them.
          </p>
        </div>
      ) : (
        <ul className="mt-5 space-y-2.5">
          {rows.map((row) => (
            <li
              key={row.id}
              className="rounded-xl border border-slate-200/80 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[12.5px] font-semibold uppercase tracking-wide text-slate-400">
                    {row.subjectCode ? `${row.subjectCode} · ` : ""}
                    {row.subjectName ?? "Not published"}
                  </p>
                  <h2 className="mt-0.5 text-[15px] font-semibold text-slate-900 dark:text-white">
                    {row.title}
                  </h2>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <StatusPill status={row.status} />
                  <NoteActions noteId={row.id} status={row.status} />
                </div>
              </div>

              {row.status === "published" ? (
                <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <Metric label="Sent to" value={row.audienceCount} />
                  <Metric label="Views" value={row.viewCount} />
                  <Metric label="Students" value={row.uniqueViewerCount} />
                  <Metric label="Saved" value={row.bookmarkCount} />
                </dl>
              ) : (
                <p className="mt-2 text-[12.5px] text-slate-400">
                  Not published — no students have these yet.
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-[11.5px] uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="text-[16px] font-semibold tabular-nums text-slate-900 dark:text-white">
        {value}
      </dd>
    </div>
  );
}

function StatusPill({ status }: { status: NoteStatus }) {
  const styles: Record<NoteStatus, string> = {
    draft: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
    published: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300",
    archived: "bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500",
  };

  return (
    <span className={`rounded-full px-2.5 py-1 text-[11.5px] font-semibold ${styles[status]}`}>
      {NOTE_STATUS_LABELS[status]}
    </span>
  );
}
