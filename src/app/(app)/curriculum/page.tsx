import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CurriculumOverviewScreen } from "@/components/app/curriculum-overview";
import { getCurriculumOverview } from "@/lib/curriculum/student-curriculum";
import { getCurrentUser } from "@/lib/current-user";

export const metadata: Metadata = { title: "Curriculum · EduPilot" };

/**
 * The student's current semester.
 *
 * The academic position is resolved from the profile on the server, so the
 * screen cannot be pointed at another semester by editing a URL, and the
 * subject list is whatever that position resolves to.
 */
export default async function Page() {
  const user = await getCurrentUser();
  // The layout already gates this; re-checked because a page must not rely on
  // its layout for authorisation.
  if (!user) redirect("/login");

  const overview = await getCurriculumOverview(user.id);

  return <CurriculumOverviewScreen overview={overview} />;
}
