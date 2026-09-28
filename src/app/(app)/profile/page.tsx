import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ProfileScreen } from "@/components/app/profile-screen";
import { getCurrentUser } from "@/lib/current-user";
import { getCurriculumOverview } from "@/lib/curriculum/student-curriculum";
import { resolveStudentContext } from "@/lib/onboarding/academic-context";
import { storedSelection } from "@/lib/onboarding/save";

export const metadata: Metadata = { title: "My Profile · EduPilot" };

/**
 * The student's profile.
 *
 * Rendered through the resolver rather than from the profile document's
 * denormalised name fields. Those are written for the legacy dashboard and go
 * stale the moment a college is renamed or a programme restructured, and a
 * student checking whether their details are right is the one reader who must
 * not be shown a cached label over a different id.
 *
 * A stored coordinate can stop resolving — a regulation archived, a branch
 * merged away. That is not an error page: the profile exists, the student can
 * still act on it, and the honest response is to say which part no longer holds
 * and point at the flow that can fix it.
 */
export default async function Page(props: PageProps<"/profile">) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const params = await props.searchParams;

  const selection = await storedSelection(user.id);
  const hasAcademic = Boolean(selection.collegeId || selection.stateId);

  /**
   * Two reads, for two different questions.
   *
   * The resolver answers "is what is stored still valid", which is what this
   * page exists to let a student check. `getCurriculumOverview` answers "what is
   * this student studying" — and it is what `/curriculum` and the dashboard
   * render, so reading it here is what stops the three screens disagreeing.
   *
   * They *can* disagree, and did: clearing the semester's subjects leaves the
   * stored selection empty while the curriculum for that semester is not, so
   * the profile said "no subjects" on a screen whose neighbours listed two.
   * Both were true and the pair was nonsense to read.
   */
  const [resolution, overview] = await Promise.all([
    hasAcademic ? resolveStudentContext(selection) : null,
    hasAcademic ? getCurriculumOverview(user.id) : null,
  ]);

  const curriculum =
    overview?.state.kind === "ready"
      ? {
          subjects: overview.state.subjects.map((subject) => ({
            id: subject.id,
            name: subject.name,
            code: subject.code,
            credits: subject.credits,
          })),
          /** False when the list is the semester's default rather than a choice. */
          confirmed: overview.subjectsConfirmed,
        }
      : null;

  return (
    <ProfileScreen
      account={{
        name: user.name,
        email: user.email,
        emailVerified: user.emailVerified,
        phone: user.phone,
        city: user.city,
        isGoogleAccount: user.isGoogleAccount,
      }}
      academic={resolution?.ok ? resolution.context : null}
      curriculum={curriculum}
      position={
        overview
          ? {
              year: overview.position.year,
              semester: overview.position.semester,
              derived: overview.position.source === "derived-from-admission",
            }
          : null
      }
      stale={
        resolution && !resolution.ok
          ? `${resolution.failure.message} Update your academic details to put this right.`
          : null
      }
      justUpdated={params.updated === "1"}
    />
  );
}
