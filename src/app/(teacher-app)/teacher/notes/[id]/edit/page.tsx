import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronRightIcon } from "@/components/icons";
import { NoteForm } from "@/components/teacher/note-form";
import { TEACHER_ROUTES } from "@/lib/app-routes";
import { getAcademicContextTree, getCurrentTeacher } from "@/lib/teaching/teacher";
import { getTeacherNote } from "@/lib/teaching/teacher-view";

export const metadata: Metadata = { title: "Edit notes · EduPilot for teachers" };

/**
 * Editing notes.
 *
 * `PUT /api/teacher/notes/:id` has always existed and nothing reached it, so a
 * teacher who published notes with a wrong figure in them had no way to correct
 * it — only to archive them and start again, which takes them out of every
 * student's list in the meantime.
 *
 * **Archived** notes are not editable. They have been taken down deliberately;
 * the way back is to publish them again, and editing something nobody can see is
 * a state with no purpose.
 */
export default async function Page(props: PageProps<"/teacher/notes/[id]/edit">) {
  const teacher = await getCurrentTeacher();
  if (!teacher) redirect("/teacher/login");

  const { id } = await props.params;
  const note = await getTeacherNote(teacher, id);

  // Filtered on `teacherUserId` and `collegeId`, so another teacher's notes
  // simply do not resolve — indistinguishable from not existing.
  if (!note) notFound();
  if (note.status === "archived") redirect(TEACHER_ROUTES.notes);

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
        <span className="max-w-[16rem] truncate text-slate-500 dark:text-slate-400">
          {note.title}
        </span>
      </nav>

      <h1 className="mt-4 text-[24px] font-bold tracking-tight text-slate-900 dark:text-white">
        Edit notes
      </h1>
      <p className="mb-5 mt-1 text-[14px] text-slate-500 dark:text-slate-400">
        {note.status === "published"
          ? "These are live. Changes appear straight away."
          : "Still a draft — nobody has seen these yet."}
      </p>

      <NoteForm
        context={context}
        canPublish={teacher.canPublish}
        existing={{
          id: note.id,
          status: note.status,
          subjectId: note.subjectId,
          title: note.title,
          description: note.description ?? "",
          content: note.content ?? "",
          // The form edits the first; the rest ride along so an edit to the
          // title cannot quietly delete them.
          links: note.externalLinks,
        }}
      />
    </div>
  );
}
