import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { NoteList } from "@/components/app/note-screens";
import { getCurrentUser } from "@/lib/current-user";
import { listStudentNotes, type NoteFilter } from "@/lib/teaching/student-view";

export const metadata: Metadata = { title: "Notes · EduPilot" };

/**
 * The student's notes (§32).
 *
 * Read from `NoteRecipient`, so last semester's material stays reachable after
 * the student moves up a year — which a live audience resolution would quietly
 * take away.
 */
export default async function Page(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const params = await props.searchParams;
  const requested = typeof params.filter === "string" ? params.filter : "all";
  const filter: NoteFilter = requested === "bookmarked" ? "bookmarked" : "all";

  const { cards } = await listStudentNotes(user.id, { filter });

  return <NoteList cards={cards} filter={filter} />;
}
