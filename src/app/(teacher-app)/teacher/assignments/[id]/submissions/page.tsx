import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronRightIcon } from "@/components/icons";
import { SubmissionTable } from "@/components/teacher/submission-table";
import { TEACHER_ROUTES } from "@/lib/app-routes";
import { ASSIGNMENT_STATUS_LABELS, type AssignmentStatus } from "@/lib/teaching/fields";
import { getCurrentTeacher } from "@/lib/teaching/teacher";
import { listSubmissions } from "@/lib/teaching/submissions";
import { getTeacherAssignment } from "@/lib/teaching/teacher-view";

export async function generateMetadata(
  props: PageProps<"/teacher/assignments/[id]/submissions">
): Promise<Metadata> {
  const { id } = await props.params;
  const teacher = await getCurrentTeacher();
  if (!teacher) return { title: "Submissions · EduPilot for teachers" };

  const assignment = await getTeacherAssignment(teacher, id);
  return {
    title: assignment
      ? `${assignment.title} · Submissions`
      : "Submissions · EduPilot for teachers",
  };
}

/**
 * Who has handed in, and marking them (§42, §43).
 *
 * The assignment and the roster are both scoped to this teacher inside their
 * queries, so a colleague's assignment id is a 404 rather than a page with
 * somebody else's students on it (§94's fifth test).
 */
export default async function Page(props: PageProps<"/teacher/assignments/[id]/submissions">) {
  const { id } = await props.params;

  const teacher = await getCurrentTeacher();
  if (!teacher) redirect("/teacher/login");

  const assignment = await getTeacherAssignment(teacher, id);
  if (!assignment) notFound();

  const { rows } = await listSubmissions(teacher, id, { limit: 200 });

  return (
    <div className="mx-auto max-w-5xl">
      <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-[13px] text-slate-400">
        <Link
          href={TEACHER_ROUTES.assignments}
          className="transition hover:text-slate-600 dark:hover:text-slate-300"
        >
          Assignments
        </Link>
        <ChevronRightIcon className="h-3.5 w-3.5" />
        <span className="truncate text-slate-500 dark:text-slate-400">{assignment.title}</span>
      </nav>

      <header className="mt-4 rounded-2xl border border-slate-200/80 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[12.5px] font-semibold uppercase tracking-wide text-slate-400">
              {assignment.targetSnapshot?.subjectCode ?? ""}{" "}
              {assignment.targetSnapshot?.subjectName ?? ""}
            </p>
            <h1 className="mt-0.5 text-[22px] font-bold tracking-tight text-slate-900 dark:text-white">
              {assignment.title}
            </h1>
            {assignment.targetSnapshot && (
              <p className="mt-1 text-[12.5px] text-slate-500 dark:text-slate-400">
                {[
                  assignment.targetSnapshot.branchName,
                  assignment.targetSnapshot.regulationCode,
                  assignment.targetSnapshot.yearLabel,
                  assignment.targetSnapshot.semesterLabel,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {/**
             * Editing live work happens here, because a published assignment's
             * detail page redirects to this one — so without this link there is
             * no route to correcting a deadline once students can see it.
             *
             * Closed work is deliberately left out: the window is over, marks
             * may be out, and changing the instructions underneath a grade makes
             * the grade unexplainable.
             */}
            {assignment.status === "published" && (
              <Link
                href={`${TEACHER_ROUTES.assignments}/${assignment.id}/edit`}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-[13px] font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                Edit
              </Link>
            )}
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11.5px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              {ASSIGNMENT_STATUS_LABELS[assignment.status as AssignmentStatus]}
            </span>
          </div>
        </div>

        <dl className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-6">
          <Metric label="Assigned" value={assignment.stats.assigned} />
          <Metric label="Viewed" value={assignment.stats.viewed} />
          <Metric label="Submitted" value={assignment.stats.submitted} />
          <Metric label="Pending" value={assignment.stats.pending} />
          <Metric label="Late" value={assignment.stats.late} />
          <Metric label="Graded" value={assignment.stats.graded} />
        </dl>
      </header>

      <div className="mt-5">
        <SubmissionTable
          assignmentId={assignment.id}
          rows={rows}
          maxMarks={assignment.maxMarks}
          canGrade={teacher.canPublish}
        />
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-[11.5px] uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="text-[19px] font-bold tabular-nums text-slate-900 dark:text-white">
        {value}
      </dd>
    </div>
  );
}
