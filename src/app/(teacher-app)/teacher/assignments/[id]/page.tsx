import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronRightIcon, UsersIcon } from "@/components/icons";
import { PublishPanel } from "@/components/teacher/publish-panel";
import { TEACHER_ROUTES } from "@/lib/app-routes";
import { ASSIGNMENT_STATUS_LABELS, type AssignmentStatus } from "@/lib/teaching/fields";
import { getCurrentTeacher } from "@/lib/teaching/teacher";
import { getTeacherAssignment } from "@/lib/teaching/teacher-view";
import { countAudience } from "@/lib/teaching/audience";
import { authorizeSubject } from "@/lib/teaching/teacher";

export async function generateMetadata(
  props: PageProps<"/teacher/assignments/[id]">
): Promise<Metadata> {
  const { id } = await props.params;
  const teacher = await getCurrentTeacher();
  if (!teacher) return { title: "Assignment · EduPilot for teachers" };

  const assignment = await getTeacherAssignment(teacher, id);
  return { title: assignment ? assignment.title : "Assignment · EduPilot for teachers" };
}

/**
 * A draft, and the decision to publish it (§15, §16).
 *
 * A **published** assignment redirects to its submissions: once work is out
 * there, what a teacher comes back for is who has handed it in, not the text
 * they already wrote.
 *
 * The eligible-student count is resolved live rather than read from the draft.
 * A draft saved last month would otherwise show the cohort it *would* have
 * reached then — and §19's whole point is that the audience is whoever is in
 * that semester now.
 */
export default async function Page(props: PageProps<"/teacher/assignments/[id]">) {
  const { id } = await props.params;

  const teacher = await getCurrentTeacher();
  if (!teacher) redirect("/teacher/login");

  const assignment = await getTeacherAssignment(teacher, id);
  if (!assignment) notFound();

  if (assignment.status === "published" || assignment.status === "closed") {
    redirect(`${TEACHER_ROUTES.assignments}/${id}/submissions`);
  }

  /**
   * Re-authorised here, not just at publish time.
   *
   * A teacher removed from the subject since saving keeps the draft and loses
   * the ability to send it — and the screen says so rather than presenting a
   * button that will refuse them (§78, §89).
   */
  const subject = await authorizeSubject(teacher, assignment.subjectId);

  const audience = subject
    ? await countAudience({
        collegeId: subject.collegeId,
        programId: subject.programId,
        branchId: subject.branchId,
        regulationId: subject.regulationId,
        semester: subject.semester,
        admissionYear: subject.admissionYear,
      })
    : null;

  return (
    <div className="mx-auto max-w-3xl">
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

      <header className="mt-4 rounded-2xl border border-slate-200/80 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h1 className="text-[22px] font-bold tracking-tight text-slate-900 dark:text-white">
            {assignment.title}
          </h1>
          <div className="flex shrink-0 items-center gap-2">
            {/* Only drafts reach this page — published and closed work redirects
                to its submissions above, which is where its Edit link lives. */}
            <Link
              href={`${TEACHER_ROUTES.assignments}/${assignment.id}/edit`}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-[13px] font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Edit
            </Link>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11.5px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              {ASSIGNMENT_STATUS_LABELS[assignment.status as AssignmentStatus]}
            </span>
          </div>
        </div>

        {assignment.description && (
          <p className="mt-3 text-[14.5px] leading-relaxed text-slate-600 dark:text-slate-300">
            {assignment.description}
          </p>
        )}

        {assignment.instructions && (
          <div className="mt-4">
            <h2 className="text-[13px] font-semibold uppercase tracking-wide text-slate-400">
              Instructions
            </h2>
            <p className="mt-1.5 whitespace-pre-line text-[14px] leading-relaxed text-slate-700 dark:text-slate-200">
              {assignment.instructions}
            </p>
          </div>
        )}

        <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-[13px]">
          <Detail label="Due" value={assignment.dueAt ? formatDate(assignment.dueAt) : "Not set"} />
          <Detail label="Marks" value={assignment.maxMarks !== null ? String(assignment.maxMarks) : "Not set"} />
          <Detail label="Hand in as" value={assignment.submissionType} />
          <Detail
            label="Late submissions"
            value={assignment.allowLateSubmission ? "Accepted" : "Not accepted"}
          />
        </dl>
      </header>

      {subject ? (
        <section className="mt-4 rounded-2xl border border-blue-200/70 bg-blue-50/60 p-5 dark:border-blue-500/20 dark:bg-blue-500/10">
          <p className="flex items-center gap-2 text-[13px] font-semibold text-blue-900 dark:text-blue-200">
            <UsersIcon className="h-4 w-4" />
            Target audience
          </p>
          <p className="mt-1.5 text-[13.5px] leading-relaxed text-blue-900/90 dark:text-blue-100/90">
            {teacher.collegeName} · {subject.programName} · {subject.branchName} ·{" "}
            {subject.regulationCode} · Year {subject.year}, Semester {subject.semester} ·{" "}
            {subject.name}
          </p>
          <p className="mt-2 text-[20px] font-bold tabular-nums text-blue-900 dark:text-blue-100">
            {audience?.count ?? 0}{" "}
            <span className="text-[13px] font-medium">
              eligible {audience?.count === 1 ? "student" : "students"}
            </span>
          </p>

          {audience && audience.skipped.positionUnknown > 0 && (
            <p className="mt-1.5 text-[12px] text-blue-900/70 dark:text-blue-100/70">
              {/*
                Reported rather than hidden: the difference between "184
                students" and "184, and 6 more we could not place" is the
                difference between a teacher trusting the number and a student
                asking why they never got it.
              */}
              {audience.skipped.positionUnknown} more could not be placed in a semester — usually a
              profile with no admission year.
            </p>
          )}

          <PublishPanel assignmentId={assignment.id} canPublish={teacher.canPublish} />
        </section>
      ) : (
        <section className="mt-4 rounded-2xl border border-amber-200/70 bg-amber-50 p-5 dark:border-amber-500/20 dark:bg-amber-500/10">
          <p className="text-[13.5px] font-semibold text-amber-900 dark:text-amber-200">
            You no longer have permission to manage this subject
          </p>
          <p className="mt-1 text-[13px] leading-relaxed text-amber-900/90 dark:text-amber-100/90">
            Your college removed you from it after you saved this draft. The draft is still here,
            and it cannot be published until you are assigned the subject again.
          </p>
        </section>
      )}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11.5px] uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="mt-0.5 font-medium capitalize text-slate-700 dark:text-slate-200">{value}</dd>
    </div>
  );
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(iso));
}
