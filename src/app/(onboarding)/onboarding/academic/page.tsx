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

  /**
   * `?edit=1` is a student coming back to correct their profile (§33).
   *
   * Without it a finished profile is bounced to the dashboard, because a
   * bookmarked step must not become a way to half-overwrite one. But that guard
   * used to be absolute, which left a student whose derived semester or branch
   * was wrong with nothing to do about it — `/curriculum` told them to check
   * their profile and there was no screen that could change it.
   *
   * The flag only decides where the student may land; it grants nothing. Every
   * save still goes through the same server-side resolution and the same
   * completeness bar (§30, §34).
   */
  const params = await props.searchParams;
  const editing = params.edit === "1";
  if (user.profileCompleted && !editing) redirect("/dashboard");

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

  /**
   * An editing student starts on the review screen, not at the step they were
   * last nudged towards. They came to change one thing, and the review screen
   * is the only one that shows everything with a way into each of them.
   */
  const resumeStep: Step = editing ? "review" : ((saved?.onboardingStep as Step) || "state");

  return (
    <AcademicFlow
      editing={editing}
      initialStates={available}
      comingSoonStates={comingSoon}
      resumeStep={resumeStep}
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
