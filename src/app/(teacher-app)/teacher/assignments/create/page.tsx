import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRightIcon } from "@/components/icons";
import { AssignmentForm } from "@/components/teacher/assignment-form";
import { TEACHER_ROUTES } from "@/lib/app-routes";
import { getAcademicContextTree, getCurrentTeacher } from "@/lib/teaching/teacher";

export const metadata: Metadata = { title: "New assignment · EduPilot for teachers" };

/**
 * Creating an assignment (§14).
 *
 * The academic tree is resolved server-side and is already narrowed to what
 * this teacher may touch (§12) — so the form cannot offer a subject they are
 * not assigned to, and the publish endpoint re-checks it regardless.
 */
export default async function Page() {
  const teacher = await getCurrentTeacher();
  if (!teacher) redirect("/teacher/login");

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
        <span className="text-slate-500 dark:text-slate-400">New</span>
      </nav>

      <h1 className="mt-4 text-[24px] font-bold tracking-tight text-slate-900 dark:text-white">
        New assignment
      </h1>
      <p className="mb-5 mt-1 text-[14px] text-slate-500 dark:text-slate-400">
        Choose a subject and EduPilot works out which students receive it.
      </p>

      <AssignmentForm context={context} canPublish={teacher.canPublish} />
    </div>
  );
}
