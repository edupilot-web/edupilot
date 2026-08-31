import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connectDB } from "@/lib/db";
import { StudentProfile } from "@/models/StudentProfile";
import { College } from "@/models/College";
import { State } from "@/models/Geo";
import { AcademicFlow, type Step } from "@/components/onboarding/academic-flow";
import { getCurrentUser } from "@/lib/current-user";

export const metadata: Metadata = { title: "Your academic profile · EduPilot" };

/**
 * The academic half of onboarding (spec §7).
 *
 * One route rather than eleven. The flow's steps depend on each other and on
 * what the chosen college actually has configured, so which steps exist is not
 * known until the student is partway through — a route per step would have to
 * encode a half-built profile in the URL to decide where to send them next.
 *
 * The page's job is to hand the client its saved state and the step to resume
 * at. Everything after that is validated server-side on each save (§30, §33).
 */
export default async function AcademicStepPage(props: PageProps<"/onboarding/academic">) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  // A finished profile has nothing to do here, and a bookmarked step must not
  // become a way to overwrite one.
  if (user.profileCompleted) redirect("/dashboard");

  await props.searchParams;
  await connectDB();

  /**
   * Read the raw document rather than the profile view.
   *
   * `toView` predates the academic coordinate and returns only the fields the
   * old two-step flow wrote, so resuming through it would silently drop the
   * regulation, semester and subjects a student had already chosen.
   */
  const [saved, states, collegeCounts] = await Promise.all([
    StudentProfile.findOne({ userId: user.id }).lean(),
    State.find({}).select("name").sort({ name: 1 }).lean(),
    College.aggregate<{ _id: unknown; n: number }>([
      { $match: { status: "active" } },
      { $group: { _id: "$stateId", n: { $sum: 1 } } },
    ]),
  ]);

  /**
   * Only states that actually have institutions are offered (§9).
   *
   * A student who picks a state and finds an empty college list reads that as a
   * broken product rather than "not launched here yet", so the empty ones are
   * named as coming soon instead.
   */
  const byState = new Map(collegeCounts.map((row) => [String(row._id), row.n]));
  const available = states
    .filter((state) => (byState.get(String(state._id)) ?? 0) > 0)
    .map((state) => ({ value: String(state._id), label: state.name }))
    .sort((a, b) => (byState.get(b.value) ?? 0) - (byState.get(a.value) ?? 0) || a.label.localeCompare(b.label));
  const comingSoon = states
    .filter((state) => (byState.get(String(state._id)) ?? 0) === 0)
    .map((state) => state.name);

  return (
    <AcademicFlow
      initialStates={available}
      comingSoonStates={comingSoon}
      resumeStep={(saved?.onboardingStep as Step) || "state"}
      defaults={{
        stateId: saved?.stateId ? String(saved.stateId) : "",
        collegeId: saved?.collegeId ? String(saved.collegeId) : "",
        programId: saved?.programId ? String(saved.programId) : "",
        branchId: saved?.branchId ? String(saved.branchId) : "",
        regulationId: saved?.regulationId ? String(saved.regulationId) : "",
        admissionYear: saved?.admissionYear ?? null,
        admissionType: saved?.admissionType ?? "regular",
        currentYear: saved?.currentYear ?? null,
        currentSemester: saved?.currentSemester ?? null,
        graduationYear: saved?.graduationYear ?? null,
        subjectIds: (saved?.subjectIds ?? []).map((id) => String(id)),
        /**
         * The degree is the "course" the flow picks, and it is stored as a plain
         * string. Resumed from the programme name where possible so the branch
         * list can load immediately.
         */
        degree: saved?.programName?.split(" in ")[0]?.trim() || saved?.degree || "",
      }}
    />
  );
}
