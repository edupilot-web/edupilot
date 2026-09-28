import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ClipboardIcon, ClockIcon, FileTextIcon, UsersIcon } from "@/components/icons";
import { TEACHER_ROUTES } from "@/lib/app-routes";
import { getCurrentTeacher, listTeacherSubjects } from "@/lib/teaching/teacher";
import { getTeacherDashboard } from "@/lib/teaching/teacher-view";

export const metadata: Metadata = { title: "Dashboard · EduPilot for teachers" };

/**
 * The teacher's dashboard (§7, §81).
 *
 * Four numbers, then the two lists a teacher actually opens this page for: what
 * is due soon and who has just submitted. Everything else on the screen is a
 * link to the place that answers a follow-up question — a dashboard that tries
 * to *be* the answer ends up being a worse version of the assignment list.
 *
 * "Students" counts distinct people across the subjects they teach, not the sum
 * of assignment audiences: a teacher with three assignments for one class has
 * one class, and summing would tell them they have 552 students.
 */
export default async function Page() {
  const teacher = await getCurrentTeacher();
  if (!teacher) redirect("/teacher/login");

  const subjects = await listTeacherSubjects(teacher);
  const dashboard = await getTeacherDashboard(teacher, subjects);

  return (
    <div className="mx-auto max-w-5xl">
      <header>
        <h1 className="text-[24px] font-bold tracking-tight text-slate-900 dark:text-white">
          Good to see you, {teacher.name.split(" ")[0]}
        </h1>
        <p className="mt-1 text-[14px] text-slate-500 dark:text-slate-400">
          {subjects.length > 0
            ? `You teach ${subjects.length} ${subjects.length === 1 ? "subject" : "subjects"} at ${teacher.collegeName}.`
            : `You have no subjects assigned at ${teacher.collegeName} yet.`}
        </p>
      </header>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Assignments"
          value={dashboard.assignments.total}
          detail={`${dashboard.assignments.published} published · ${dashboard.assignments.draft} draft`}
          icon={<ClipboardIcon className="h-[18px] w-[18px]" />}
          href={TEACHER_ROUTES.assignments}
        />
        <Stat
          label="Notes"
          value={dashboard.notes.total}
          detail={`${dashboard.notes.published} published`}
          icon={<FileTextIcon className="h-[18px] w-[18px]" />}
          href={TEACHER_ROUTES.notes}
        />
        <Stat
          label="Students"
          value={dashboard.students}
          detail="across your subjects"
          icon={<UsersIcon className="h-[18px] w-[18px]" />}
          href={TEACHER_ROUTES.students}
        />
        <Stat
          label="To mark"
          value={dashboard.submissions.pendingReview}
          detail={
            dashboard.submissionRate !== null
              ? `${dashboard.submissionRate}% submission rate`
              : "nothing published yet"
          }
          icon={<ClockIcon className="h-[18px] w-[18px]" />}
          href={TEACHER_ROUTES.assignments}
        />
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <section className="rounded-2xl border border-slate-200/80 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="text-[15px] font-semibold text-slate-900 dark:text-white">Due soon</h2>

          {dashboard.dueSoon.length === 0 ? (
            <p className="mt-2 text-[13.5px] leading-relaxed text-slate-500 dark:text-slate-400">
              Nothing with a deadline coming up.
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {dashboard.dueSoon.map((item) => (
                <li key={item.id}>
                  <Link
                    href={`${TEACHER_ROUTES.assignments}/${item.id}/submissions`}
                    className="block rounded-xl border border-slate-200/70 p-3 transition hover:border-blue-300 dark:border-slate-800"
                  >
                    <p className="text-[13.5px] font-medium text-slate-900 dark:text-white">
                      {item.title}
                    </p>
                    <p className="mt-0.5 text-[12.5px] text-slate-500 dark:text-slate-400">
                      {item.subjectName} · due {formatDate(item.dueAt)}
                    </p>
                    <p className="mt-1.5 text-[12px] text-slate-400">
                      {item.submitted} of {item.assigned} submitted
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-2xl border border-slate-200/80 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="text-[15px] font-semibold text-slate-900 dark:text-white">
            Recent submissions
          </h2>

          {dashboard.recentSubmissions.length === 0 ? (
            <p className="mt-2 text-[13.5px] leading-relaxed text-slate-500 dark:text-slate-400">
              Nothing handed in yet.
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {dashboard.recentSubmissions.map((item, index) => (
                <li
                  key={`${item.assignmentId}-${index}`}
                  className="flex items-baseline justify-between gap-3 border-b border-slate-100 pb-2 last:border-0 dark:border-slate-800"
                >
                  <div className="min-w-0">
                    <p className="truncate text-[13.5px] font-medium text-slate-900 dark:text-white">
                      {item.studentName}
                    </p>
                    <p className="truncate text-[12.5px] text-slate-500 dark:text-slate-400">
                      {item.assignmentTitle}
                    </p>
                  </div>
                  <p className="shrink-0 text-[12px] text-slate-400">
                    {item.isLate && <span className="mr-1.5 text-amber-600">late</span>}
                    {formatDate(item.submittedAt)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {subjects.length > 0 && (
        <section className="mt-6">
          <h2 className="text-[15px] font-semibold text-slate-900 dark:text-white">
            Your subjects
          </h2>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {subjects.map((subject) => (
              <li
                key={subject.subjectId}
                className="rounded-xl border border-slate-200/80 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
              >
                <p className="text-[14px] font-medium text-slate-900 dark:text-white">
                  {subject.name}
                </p>
                <p className="mt-0.5 text-[12.5px] text-slate-500 dark:text-slate-400">
                  {subject.code} · {subject.branchName} · Year {subject.year}, Semester{" "}
                  {subject.semester}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  detail,
  icon,
  href,
}: {
  label: string;
  value: number;
  detail: string;
  icon: React.ReactNode;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="rounded-2xl border border-slate-200/80 bg-white p-4 transition hover:border-blue-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 dark:border-slate-800 dark:bg-slate-900"
    >
      <span className="grid h-8 w-8 place-items-center rounded-lg bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
        {icon}
      </span>
      <p className="mt-2.5 text-[24px] font-bold tabular-nums leading-none text-slate-900 dark:text-white">
        {value}
      </p>
      <p className="mt-1 text-[13px] font-medium text-slate-700 dark:text-slate-200">{label}</p>
      <p className="mt-0.5 text-[12px] text-slate-400 dark:text-slate-500">{detail}</p>
    </Link>
  );
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
