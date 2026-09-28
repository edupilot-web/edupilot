import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AssignmentList } from "@/components/app/assignment-list";
import { getCurrentUser } from "@/lib/current-user";
import { listStudentAssignments, type AssignmentFilter } from "@/lib/teaching/student-view";

export const metadata: Metadata = { title: "Assignments · EduPilot" };

const FILTERS: AssignmentFilter[] = ["all", "pending", "submitted", "overdue", "completed"];

/**
 * The student's assignments (§25).
 *
 * Read from their own `AssignmentStudent` rows, which is the authorisation as
 * much as the query: work they were never given has no row, and work they were
 * given stays theirs after they move up a year (§19, §78).
 */
export default async function Page(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await getCurrentUser();
  // The layout gates this too; re-checked because a page must not rely on its
  // layout for authorisation.
  if (!user) redirect("/login");

  const params = await props.searchParams;
  const requested = typeof params.filter === "string" ? params.filter : "all";
  const filter = (FILTERS as string[]).includes(requested)
    ? (requested as AssignmentFilter)
    : "all";

  const { cards, counts } = await listStudentAssignments(user.id, { filter });

  return <AssignmentList cards={cards} counts={counts} filter={filter} />;
}
