import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { SubjectDetail } from "@/components/app/subject-detail";
import { getSubjectView } from "@/lib/curriculum/student-curriculum";
import { getSubjectTopics } from "@/lib/learning/topics";
import { getCurrentUser } from "@/lib/current-user";

export async function generateMetadata(
  props: PageProps<"/curriculum/[subjectId]">
): Promise<Metadata> {
  const { subjectId } = await props.params;
  const user = await getCurrentUser();
  if (!user) return { title: "Curriculum · EduPilot" };

  const subject = await getSubjectView(user.id, subjectId);
  return { title: subject ? `${subject.code} ${subject.name} · EduPilot` : "Curriculum · EduPilot" };
}

/**
 * One subject's syllabus and its mapped reading.
 *
 * `getSubjectView` resolves the student's coordinate from their profile and
 * makes it part of the query, so a subject id from another college is simply
 * not found — the same answer as an id that does not exist, which is what keeps
 * a probed URL from revealing what another college runs.
 */
export default async function Page(props: PageProps<"/curriculum/[subjectId]">) {
  const { subjectId } = await props.params;

  const user = await getCurrentUser();
  if (!user) redirect("/login");

  /**
   * Both reads run together: they authorise against the same profile and
   * neither depends on the other, so sequencing them would double the page's
   * latency budget (§76) to no purpose.
   */
  const [subject, topics] = await Promise.all([
    getSubjectView(user.id, subjectId),
    getSubjectTopics(user.id, subjectId),
  ]);

  if (!subject) notFound();

  return <SubjectDetail subject={subject} topics={topics} />;
}
