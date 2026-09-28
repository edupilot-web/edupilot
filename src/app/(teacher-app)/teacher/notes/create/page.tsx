import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRightIcon } from "@/components/icons";
import { NoteForm } from "@/components/teacher/note-form";
import { TEACHER_ROUTES } from "@/lib/app-routes";
import { getAcademicContextTree, getCurrentTeacher } from "@/lib/teaching/teacher";

export const metadata: Metadata = { title: "Share notes · EduPilot for teachers" };

export default async function Page() {
  const teacher = await getCurrentTeacher();
  if (!teacher) redirect("/teacher/login");

  const context = await getAcademicContextTree(teacher);

  return (
    <div className="mx-auto max-w-3xl">
      <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-[13px] text-slate-400">
        <Link
          href={TEACHER_ROUTES.notes}
          className="transition hover:text-slate-600 dark:hover:text-slate-300"
        >
          Notes
        </Link>
        <ChevronRightIcon className="h-3.5 w-3.5" />
        <span className="text-slate-500 dark:text-slate-400">New</span>
      </nav>

      <h1 className="mt-4 text-[24px] font-bold tracking-tight text-slate-900 dark:text-white">
        Share notes
      </h1>
      <p className="mb-5 mt-1 text-[14px] text-slate-500 dark:text-slate-400">
        Pick a subject and everyone taking it gets these.
      </p>

      <NoteForm context={context} canPublish={teacher.canPublish} />
    </div>
  );
}
