import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { after } from "next/server";
import { NoteDetail } from "@/components/app/note-screens";
import { APP_ROUTES } from "@/lib/app-routes";
import { getCurrentUser } from "@/lib/current-user";
import { getStudentNote, recordNoteView } from "@/lib/teaching/student-view";

export async function generateMetadata(props: PageProps<"/notes/[id]">): Promise<Metadata> {
  const { id } = await props.params;
  const user = await getCurrentUser();
  if (!user) return { title: "Notes · EduPilot" };

  const { note } = await getStudentNote(user.id, id);
  return { title: note ? `${note.title} · EduPilot` : "Notes · EduPilot" };
}

export default async function Page(props: PageProps<"/notes/[id]">) {
  const { id } = await props.params;

  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { note, archived } = await getStudentNote(user.id, id);

  /**
   * An archived note gets its own screen, not a 404 (§78, §89).
   *
   * The student *did* receive it and may be holding a bookmark; telling them it
   * never existed reads as a bug, while "the teacher took these down" is the
   * truth and explains what happened.
   */
  if (archived) {
    return (
      <div className="mx-auto max-w-lg rounded-2xl border border-slate-200/80 bg-white p-8 text-center dark:border-slate-800 dark:bg-slate-900">
        <h1 className="text-[18px] font-semibold text-slate-900 dark:text-white">
          These notes have been taken down
        </h1>
        <p className="mt-2 text-[14px] leading-relaxed text-slate-500 dark:text-slate-400">
          Your teacher archived them. Anything you saved from them is still yours, but the notes
          themselves are no longer available.
        </p>
        <Link
          href={APP_ROUTES.notes}
          className="mt-5 inline-flex rounded-lg bg-blue-600 px-4 py-2.5 text-[14px] font-semibold text-white transition hover:bg-blue-700"
        >
          Back to notes
        </Link>
      </div>
    );
  }

  if (!note) notFound();

  after(() => recordNoteView(user.id, id));

  return <NoteDetail note={note} />;
}
