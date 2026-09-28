import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { TopicLearning } from "@/components/app/topic-learning";
import { getTopicView } from "@/lib/learning/topics";
import { getTopicMaterial } from "@/lib/teaching/student-view";
import { getCurrentUser } from "@/lib/current-user";

/**
 * The topic learning page (§8, §38) — the core of the module.
 *
 * Everything on it is server-rendered from the database: the syllabus text, the
 * prepared explanation, the practical section, the key points, the self-check,
 * the student's progress and the questions they asked before. **No model is
 * called to render this page** (§9), which is what keeps it inside §76's
 * budget and what makes it free to open.
 *
 * The AI enters only when the student presses "Go deeper" or asks something,
 * and that happens client-side against `/api/ai/*`.
 *
 * The subject id is in the URL for navigation only. Authorisation comes from
 * the *topic*: `getTopicView` resolves the student's coordinate from their
 * profile and requires the topic's subject to match it, so a mismatched or
 * foreign subject id changes nothing about what may be read.
 */

export async function generateMetadata(
  props: PageProps<"/curriculum/[subjectId]/topics/[topicId]">
): Promise<Metadata> {
  const { topicId } = await props.params;
  const user = await getCurrentUser();
  if (!user) return { title: "Curriculum · EduPilot" };

  const topic = await getTopicView(user.id, topicId);
  return { title: topic ? `${topic.title} · ${topic.subject.code} · EduPilot` : "Curriculum · EduPilot" };
}

export default async function Page(props: PageProps<"/curriculum/[subjectId]/topics/[topicId]">) {
  const { subjectId, topicId } = await props.params;

  const user = await getCurrentUser();
  // The layout gates this too; re-checked because a page must not rely on its
  // layout for authorisation.
  if (!user) redirect("/login");

  const topic = await getTopicView(user.id, topicId);
  if (!topic) notFound();

  /**
   * A topic reached through the wrong subject's URL is redirected, not 404'd.
   *
   * The topic is legitimately this student's; only the path is stale — which is
   * what a bookmark taken before a curriculum edit looks like. Sending them to
   * the canonical URL is the honest answer, and it keeps the breadcrumb from
   * pointing at a subject the topic does not belong to.
   */
  if (topic.subject.id !== subjectId) {
    redirect(`/curriculum/${topic.subject.id}/topics/${topic.id}`);
  }

  /**
   * The assignments and notes attached to this topic (§51, §52).
   *
   * Fetched after the topic rather than alongside it, because it needs the
   * authorised topic id — and a student who cannot see the topic must not have
   * caused a read of its coursework either.
   *
   * It reads from the student's own recipient rows, so this shows what *they*
   * received rather than everything any teacher has ever attached to the topic,
   * which would include other cohorts' work.
   */
  const material = await getTopicMaterial(user.id, topic.id);

  return <TopicLearning topic={topic} material={material} />;
}
