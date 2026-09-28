import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AiTutorHub } from "@/components/app/ai-tutor-hub";
import { getCurriculumOverview } from "@/lib/curriculum/student-curriculum";
import { getCurrentUser } from "@/lib/current-user";
import { listConversations } from "@/lib/tutor/history";
import { checkDailyQuota } from "@/lib/tutor/usage";

export const metadata: Metadata = { title: "AI Tutor · EduPilot" };

/**
 * The AI Tutor hub.
 *
 * Deliberately **not** a chat window (§37: "AI should feel integrated into
 * learning rather than looking like a generic ChatGPT clone"). There is no
 * message box on this page at all, because a tutor with no topic in front of it
 * has nothing to be grounded on — every answer in this product is answered
 * against a specific topic of the student's own syllabus, and a free-floating
 * chat would be the one path that bypasses that.
 *
 * So this screen does three things: it shows the threads already open, it says
 * how many questions are left today, and it sends the student into a subject.
 * The tutor itself lives on the topic page, next to the material it is
 * explaining.
 */
export default async function Page() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  /**
   * Three independent reads, run together. The quota and the conversations do
   * not depend on the curriculum, and sequencing them would make a page that is
   * mostly a list wait for three round trips.
   */
  const [conversations, quota, curriculum] = await Promise.all([
    listConversations(user.id, { limit: 12 }),
    checkDailyQuota(user.id),
    getCurriculumOverview(user.id),
  ]);

  return (
    <AiTutorHub
      conversations={conversations}
      quota={{ used: quota.used, limit: quota.limit, remaining: quota.remaining }}
      subjects={curriculum.state.kind === "ready" ? curriculum.state.subjects : []}
      positionLabel={curriculum.positionLabel}
    />
  );
}
