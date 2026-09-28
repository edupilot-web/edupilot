import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { after } from "next/server";
import { AssignmentDetail } from "@/components/app/assignment-detail";
import { getCurrentUser } from "@/lib/current-user";
import { getStudentAssignment } from "@/lib/teaching/student-view";
import { recordView } from "@/lib/teaching/submissions";

export async function generateMetadata(
  props: PageProps<"/assignments/[id]">
): Promise<Metadata> {
  const { id } = await props.params;
  const user = await getCurrentUser();
  if (!user) return { title: "Assignments · EduPilot" };

  const assignment = await getStudentAssignment(user.id, id);
  return { title: assignment ? `${assignment.title} · EduPilot` : "Assignments · EduPilot" };
}

/**
 * One assignment (§26).
 *
 * A 404 for anything not published to this student — identical to an id that
 * does not exist, so a probed URL cannot be used to learn what another cohort
 * has been set (§94).
 *
 * The view is recorded through `after()`, so the write never sits between the
 * student and the page.
 */
export default async function Page(props: PageProps<"/assignments/[id]">) {
  const { id } = await props.params;

  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const assignment = await getStudentAssignment(user.id, id);
  if (!assignment) notFound();

  after(() => recordView(user.id, id));

  return <AssignmentDetail assignment={assignment} />;
}
