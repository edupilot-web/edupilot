import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronRightIcon } from "@/components/icons";
import { AssignmentForm } from "@/components/teacher/assignment-form";
import { TEACHER_ROUTES } from "@/lib/app-routes";
import { getAcademicContextTree, getCurrentTeacher } from "@/lib/teaching/teacher";
import { getTeacherAssignment } from "@/lib/teaching/teacher-view";

export const metadata: Metadata = { title: "Edit assignment · EduPilot for teachers" };

/**
 * Editing an assignment.
 *
 * `PUT /api/teacher/assignments/:id` has always existed; nothing reached it, so
 * a teacher who mistyped a deadline had no way to correct it through the
 * product. That is the gap this page closes.
 *
 * Reuses `AssignmentForm` rather than getting its own: the fields, the
 * validation and the wording of every error are the same, and a second copy is
 * how the two drift apart.
 *
 * A **closed** assignment is not editable. The window is over, marks may already
 * be out, and changing the instructions underneath work that has been graded
 * would make the grades unexplainable.
 */
export default async function Page(props: PageProps<"/teacher/assignments/[id]/edit">) {
  const teacher = await getCurrentTeacher();
  if (!teacher) redirect("/teacher/login");

  const { id } = await props.params;
  const assignment = await getTeacherAssignment(teacher, id);

  /**
   * A 404 for "not yours" as well as "does not exist".
   *
   * `getTeacherAssignment` filters on `teacherUserId` *and* `collegeId`, so
   * another teacher's assignment simply does not resolve — the two cases are
   * identical from outside, which is what stops an id being probed to learn
   * what a colleague has set.
   */
  if (!assignment) notFound();

  if (assignment.status === "closed") {
    redirect(`${TEACHER_ROUTES.assignments}/${id}`);
  }

  const context = await getAcademicContextTree(teacher);

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
        <Link
          href={`${TEACHER_ROUTES.assignments}/${id}`}
          className="max-w-[16rem] truncate transition hover:text-slate-600 dark:hover:text-slate-300"
        >
          {assignment.title}
        </Link>
        <ChevronRightIcon className="h-3.5 w-3.5" />
        <span className="text-slate-500 dark:text-slate-400">Edit</span>
      </nav>

      <h1 className="mt-4 text-[24px] font-bold tracking-tight text-slate-900 dark:text-white">
        Edit assignment
      </h1>
      <p className="mb-5 mt-1 text-[14px] text-slate-500 dark:text-slate-400">
        {assignment.status === "published"
          ? "This is live. Your students see changes to the deadline, the instructions and the attachments."
          : "Still a draft — nobody has seen this yet."}
      </p>

      <AssignmentForm
        context={context}
        canPublish={teacher.canPublish}
        existing={{
          id: assignment.id,
          status: assignment.status,
          subjectId: assignment.subjectId,
          title: assignment.title,
          description: assignment.description ?? "",
          instructions: assignment.instructions ?? "",
          submissionType: assignment.submissionType as "text",
          maxMarks: assignment.maxMarks === null ? "" : String(assignment.maxMarks),
          /**
           * `datetime-local` wants `YYYY-MM-DDTHH:mm` in **local** time, and an
           * ISO string is UTC with a `Z`. Feeding it one puts the field hours
           * out, which a teacher would read as the deadline having moved.
           */
          dueAt: toLocalInput(assignment.dueAt),
          allowLateSubmission: assignment.allowLateSubmission,
          lateSubmissionUntil: toLocalInput(assignment.lateSubmissionUntil),
        }}
      />
    </div>
  );
}

function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";

  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
}
