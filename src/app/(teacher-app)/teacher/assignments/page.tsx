import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ClipboardIcon, PlusIcon } from "@/components/icons";
import { TEACHER_ROUTES } from "@/lib/app-routes";
import { ASSIGNMENT_STATUS_LABELS, type AssignmentStatus } from "@/lib/teaching/fields";
import { getCurrentTeacher } from "@/lib/teaching/teacher";
import { listTeacherAssignments } from "@/lib/teaching/teacher-view";

export const metadata: Metadata = { title: "Assignments · EduPilot for teachers" };

const TABS = [
  { key: "all", label: "All" },
  { key: "draft", label: "Drafts" },
  { key: "published", label: "Published" },
  { key: "closed", label: "Closed" },
];

/**
 * The teacher's assignments (§42).
 *
 * Every row carries the numbers a teacher acts on — assigned, viewed,
 * submitted, pending, graded — read from the roll-ups on the assignment itself.
 * A page of ten is one query rather than ten aggregations over
 * `AssignmentStudent`.
 *
 * Rows link to the submissions table rather than to a read-only detail page:
 * once work is published, what a teacher comes back for is who has handed it
 * in.
 */
export default async function Page(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const teacher = await getCurrentTeacher();
  if (!teacher) redirect("/teacher/login");

  const params = await props.searchParams;
  const status = typeof params.status === "string" ? params.status : "all";

  const { rows } = await listTeacherAssignments(teacher, { status });

  return (
    <div className="mx-auto max-w-5xl">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[24px] font-bold tracking-tight text-slate-900 dark:text-white">
            Assignments
          </h1>
          <p className="mt-1 text-[14px] text-slate-500 dark:text-slate-400">
            Work you have set, and how your students are getting on with it.
          </p>
        </div>

        <Link
          href={`${TEACHER_ROUTES.assignments}/create`}
          className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2.5 text-[14px] font-semibold text-white transition hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-500/25"
        >
          <PlusIcon className="h-4 w-4" />
          New assignment
        </Link>
      </header>

      <nav aria-label="Filter assignments" className="mt-5 flex flex-wrap gap-1.5">
        {TABS.map((tab) => {
          const active = tab.key === status;
          return (
            <Link
              key={tab.key}
              href={
                tab.key === "all"
                  ? TEACHER_ROUTES.assignments
                  : `${TEACHER_ROUTES.assignments}?status=${tab.key}`
              }
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

      {rows.length === 0 ? (
        <div className="mt-4 rounded-2xl border border-slate-200/80 bg-white p-10 text-center dark:border-slate-800 dark:bg-slate-900">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-slate-100 text-slate-400 dark:bg-slate-800">
            <ClipboardIcon className="h-6 w-6" />
          </span>
          <p className="mt-3.5 text-[15px] font-semibold text-slate-800 dark:text-slate-100">
            No assignments yet
          </p>
          <p className="mx-auto mt-1.5 max-w-sm text-[13.5px] leading-relaxed text-slate-500 dark:text-slate-400">
            Pick a subject and EduPilot works out which students receive it — you never select
            students by hand.
          </p>
        </div>
      ) : (
        <ul className="mt-4 space-y-2.5">
          {rows.map((row) => (
            <li key={row.id}>
              <Link
                href={`${TEACHER_ROUTES.assignments}/${row.id}/submissions`}
                className="block rounded-xl border border-slate-200/80 bg-white p-4 transition hover:border-blue-300 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 dark:border-slate-800 dark:bg-slate-900"
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
                  <StatusPill status={row.status} />
                </div>

                {row.status === "published" || row.status === "closed" ? (
                  <dl className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5">
                    <Metric label="Assigned" value={row.assignedCount} />
                    <Metric label="Viewed" value={row.viewedCount} />
                    <Metric label="Submitted" value={row.submittedCount} />
                    <Metric label="Pending" value={row.pendingCount} />
                    <Metric label="Graded" value={row.gradedCount} />
                  </dl>
                ) : (
                  <p className="mt-2 text-[12.5px] text-slate-400">
                    Not published — no students have this yet.
                  </p>
                )}
              </Link>
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

function StatusPill({ status }: { status: AssignmentStatus }) {
  const styles: Record<AssignmentStatus, string> = {
    draft: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
    scheduled: "bg-violet-50 text-violet-700 dark:bg-violet-500/10 dark:text-violet-300",
    published: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300",
    closed: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
    archived: "bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500",
  };

  return (
    <span
      className={`shrink-0 rounded-full px-2.5 py-1 text-[11.5px] font-semibold ${styles[status]}`}
    >
      {ASSIGNMENT_STATUS_LABELS[status]}
    </span>
  );
}
