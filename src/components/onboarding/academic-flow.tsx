"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Combobox, type ComboboxOption } from "@/components/onboarding/combobox";

/**
 * The academic onboarding flow (spec §7, §32, §33, §40, §41).
 *
 * One client component for the whole path. Every step depends on the one before
 * it, the flow skips steps a college cannot supply, and progress autosaves — all
 * three of which need shared state, and none of which survives being split
 * across routes without serialising a half-built profile into a URL.
 *
 * Three properties this is built around:
 *
 *   1. **Changing a parent clears its children** (§32). The state cannot hold a
 *      branch from a previous college, so a stale coordinate is impossible
 *      rather than merely guarded against.
 *   2. **Steps with no data are skipped** (§7). Only a handful of colleges have
 *      a curriculum configured; the rest end after year, and the profile fills
 *      itself in later when an administrator adds the rest.
 *   3. **The server decides what is complete** (§34). This component asks; it
 *      never asserts.
 */

type Option = { value: string; label: string; hint?: string | null };

type Institution = {
  kind: "college" | "university";
  value: string;
  label: string;
  code: string | null;
  institutionType?: string;
  autonomyStatus?: string;
  affiliation?: string | null;
  location: string | null;
};

type CollegeDetail = {
  id: string;
  name: string;
  code: string | null;
  institutionType: string;
  autonomyStatus: string;
  location: string;
  active: boolean;
  university: { id: string; name: string; shortName: string | null; type: string } | null;
};

type Course = { value: string; label: string; durationYears: number | null; branchCount: number };
type Branch = { value: string; label: string; code: string | null; programId: string; programName: string; durationYears: number | null };
type RegulationOption = { value: string; label: string; name: string; effectiveFromYear: number; effectiveToYear: number | null; totalSemesters: number; superseded: boolean };
type SemesterOption = { value: number; label: string; year: number; subjectCount: number };
type SubjectOption = { value: string; label: string; code: string; credits: number | null; type: string; required: boolean; unitCount: number };

export type Step =
  | "state"
  | "institution"
  | "confirm"
  | "course"
  | "branch"
  | "regulation"
  | "batch"
  | "semester"
  | "subjects"
  | "graduation"
  | "review";

export type FlowDefaults = {
  stateId: string;
  collegeId: string;
  programId: string;
  branchId: string;
  regulationId: string;
  admissionYear: number | null;
  admissionType: string;
  currentYear: number | null;
  currentSemester: number | null;
  graduationYear: number | null;
  subjectIds: string[];
  degree: string;
};

const AUTONOMY_LABELS: Record<string, string> = {
  autonomous: "Autonomous",
  "non-autonomous": "Non-Autonomous",
  "university-controlled": "University Controlled",
  "not-applicable": "Not Applicable",
};

/** Debounce for the autosave, long enough that typing does not spam the server. */
const SAVE_DEBOUNCE_MS = 900;

async function academic<T>(step: string, query: Record<string, string> = {}): Promise<T | null> {
  const params = new URLSearchParams({ step, ...query });
  const response = await fetch(`/api/academic?${params}`, { cache: "no-store" });
  if (!response.ok) return null;
  const payload = await response.json();
  return (payload?.data ?? null) as T;
}

export function AcademicFlow({
  defaults,
  resumeStep,
  initialStates,
  comingSoonStates,
}: {
  defaults: FlowDefaults;
  resumeStep: Step;
  /**
   * Rendered on the server so the first screen paints with its options already
   * there. The state list is the one thing every student sees and it never
   * changes between requests, so fetching it from the client would cost a
   * round-trip to show an empty screen first.
   */
  initialStates: Option[];
  comingSoonStates: string[];
}) {
  const router = useRouter();

  // ── Selection state ───────────────────────────────────────────────────
  const [stateId, setStateId] = useState(defaults.stateId);
  const [collegeId, setCollegeId] = useState(defaults.collegeId);
  const [degree, setDegree] = useState(defaults.degree);
  const [branchId, setBranchId] = useState(defaults.branchId);
  const [programId, setProgramId] = useState(defaults.programId);
  const [regulationId, setRegulationId] = useState(defaults.regulationId);
  const [admissionYear, setAdmissionYear] = useState<number | null>(defaults.admissionYear);
  const [admissionType, setAdmissionType] = useState(defaults.admissionType || "regular");
  const [currentSemester, setCurrentSemester] = useState<number | null>(defaults.currentSemester);
  const [currentYear, setCurrentYear] = useState<number | null>(defaults.currentYear);
  const [graduationYear, setGraduationYear] = useState<number | null>(defaults.graduationYear);
  const [subjectIds, setSubjectIds] = useState<string[]>(defaults.subjectIds);

  // ── Option state ──────────────────────────────────────────────────────
  const [states, setStates] = useState<Option[]>(initialStates);
  const [comingSoon, setComingSoon] = useState<string[]>(comingSoonStates);
  const [institutionQuery, setInstitutionQuery] = useState("");
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [college, setCollege] = useState<CollegeDetail | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [regulations, setRegulations] = useState<RegulationOption[]>([]);
  const [semesters, setSemesters] = useState<SemesterOption[]>([]);
  const [subjects, setSubjects] = useState<SubjectOption[]>([]);
  const [subjectQuery, setSubjectQuery] = useState("");

  const [step, setStep] = useState<Step>(resumeStep);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [requestOpen, setRequestOpen] = useState(false);
  const [requestNote, setRequestNote] = useState<string | null>(null);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Suppresses the autosave that would otherwise fire on first render. */
  const hydrated = useRef(false);

  /**
   * Course length, and the graduation year derived from it (§46).
   *
   * Both sit above `selection` because the submitted payload carries the
   * graduation year, and derived-in-place is what lets the batch change without
   * leaving a stale year behind. The student's own choice always wins; the
   * formula only supplies a default, so nothing is stored until they pick one.
   *
   * Deriving rather than syncing in an effect also keeps this out of the
   * render-cascade the repo's lint rules reject.
   */
  const duration =
    branches.find((entry) => entry.value === branchId)?.durationYears ??
    courses.find((entry) => entry.value === degree)?.durationYears ??
    null;

  const derivedGraduation = useMemo(() => {
    if (!admissionYear || !duration) return null;
    const years = admissionType === "lateral-entry" ? Math.max(1, duration - 1) : duration;
    return admissionYear + years;
  }, [admissionYear, admissionType, duration]);

  const effectiveGraduation = graduationYear ?? derivedGraduation;

  const selection = useMemo(
    () => ({
      stateId,
      collegeId,
      programId,
      branchId,
      regulationId,
      admissionYear,
      admissionType,
      currentYear,
      currentSemester,
      graduationYear: effectiveGraduation,
      subjectIds,
    }),
    [stateId, collegeId, programId, branchId, regulationId, admissionYear, admissionType, currentYear, currentSemester, effectiveGraduation, subjectIds]
  );

  // ── §32: changing a parent clears its children ────────────────────────

  const changeState = (next: string) => {
    setStateId(next);
    setCollegeId("");
    setCollege(null);
    setDegree("");
    setProgramId("");
    setBranchId("");
    setRegulationId("");
    setCurrentSemester(null);
    setCurrentYear(null);
    setSubjectIds([]);
  };

  const changeCollege = (next: string) => {
    setCollegeId(next);
    setDegree("");
    setProgramId("");
    setBranchId("");
    setRegulationId("");
    setCurrentSemester(null);
    setCurrentYear(null);
    setSubjectIds([]);
  };

  const changeDegree = (next: string) => {
    setDegree(next);
    setProgramId("");
    setBranchId("");
    setRegulationId("");
    setCurrentSemester(null);
    setCurrentYear(null);
    setSubjectIds([]);
  };

  const changeBranch = (branch: Branch) => {
    setBranchId(branch.value);
    setProgramId(branch.programId);
    setRegulationId("");
    setCurrentSemester(null);
    setCurrentYear(null);
    setSubjectIds([]);
  };

  const changeRegulation = (next: string) => {
    setRegulationId(next);
    setCurrentSemester(null);
    setCurrentYear(null);
    setSubjectIds([]);
  };

  const changeSemester = (next: number) => {
    setCurrentSemester(next);
    setCurrentYear(Math.ceil(next / 2));
    setSubjectIds([]);
  };

  // ── Loading options. Every setState is in an async continuation. ──────

  useEffect(() => {
    // Only fetch when the server render came back empty — otherwise the list is
    // already correct and a request would replace it with the same thing.
    if (initialStates.length) return;

    let live = true;
    academic<{ states: (Option & { count: number })[]; comingSoon: string[] }>("states").then((data) => {
      if (!live || !data) return;
      setStates(data.states);
      setComingSoon(data.comingSoon);
    });
    return () => {
      live = false;
    };
  }, [initialStates.length]);

  useEffect(() => {
    if (!stateId) return;
    let live = true;
    const query = institutionQuery.trim();
    academic<{ institutions: Institution[]; universities: Institution[] }>("colleges", {
      stateId,
      ...(query.length >= 2 ? { search: query } : {}),
    }).then((data) => {
      if (!live || !data) return;
      setInstitutions([...(data.institutions ?? []), ...(data.universities ?? [])]);
    });
    return () => {
      live = false;
    };
  }, [stateId, institutionQuery]);

  useEffect(() => {
    if (!collegeId) return;
    let live = true;
    academic<{ college: CollegeDetail }>("college", { collegeId }).then((data) => {
      if (live && data) setCollege(data.college);
    });
    return () => {
      live = false;
    };
  }, [collegeId]);

  useEffect(() => {
    if (!collegeId) return;
    let live = true;
    academic<{ courses: Course[] }>("courses", { collegeId }).then((data) => {
      if (!live || !data) return;
      setCourses(data.courses);
      if (data.courses.length === 1) changeDegree(data.courses[0].value);
    });
    return () => {
      live = false;
    };
  }, [collegeId]);

  useEffect(() => {
    if (!collegeId || !degree) return;
    let live = true;
    academic<{ branches: Branch[] }>("branches", { collegeId, degree }).then((data) => {
      if (live && data) setBranches(data.branches);
    });
    return () => {
      live = false;
    };
  }, [collegeId, degree]);

  useEffect(() => {
    if (!collegeId) return;
    let live = true;
    academic<{ regulations: RegulationOption[] }>("regulations", {
      collegeId,
      ...(degree ? { degree } : {}),
      ...(programId ? { programId } : {}),
    }).then((data) => {
      if (live && data) setRegulations(data.regulations);
    });
    return () => {
      live = false;
    };
  }, [collegeId, degree, programId]);

  useEffect(() => {
    if (!regulationId) return;
    let live = true;
    academic<{ semesters: SemesterOption[] }>("semesters", {
      regulationId,
      ...(branchId ? { branchId } : {}),
    }).then((data) => {
      if (live && data) setSemesters(data.semesters);
    });
    return () => {
      live = false;
    };
  }, [regulationId, branchId]);

  useEffect(() => {
    if (!collegeId || !programId || !branchId || !regulationId || currentSemester === null) return;
    let live = true;
    const query = subjectQuery.trim();
    academic<{ subjects: SubjectOption[] }>("subjects", {
      collegeId,
      programId,
      branchId,
      regulationId,
      semester: String(currentSemester),
      ...(query.length >= 2 ? { search: query } : {}),
    }).then((data) => {
      if (!live || !data) return;
      setSubjects(data.subjects);
      // §25: required subjects are pre-ticked; electives are a choice.
      setSubjectIds((current) =>
        current.length ? current : data.subjects.filter((s) => s.required).map((s) => s.value)
      );
    });
    return () => {
      live = false;
    };
  }, [collegeId, programId, branchId, regulationId, currentSemester, subjectQuery]);

  // ── §33: debounced autosave ──────────────────────────────────────────

  useEffect(() => {
    if (!hydrated.current) {
      hydrated.current = true;
      return;
    }
    if (!stateId) return;

    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      setSaving(true);
      fetch("/api/profile/academic", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(selection),
      })
        .then(async (response) => {
          if (!response.ok) {
            const payload = await response.json().catch(() => null);
            // A rejected relationship is worth showing immediately rather than
            // letting the student reach the review screen and fail there.
            if (response.status === 422) setError(payload?.error?.message ?? null);
            return;
          }
          setError(null);
        })
        .finally(() => setSaving(false));
    }, SAVE_DEBOUNCE_MS);

    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [selection, stateId]);

  // ── Derived flow shape ───────────────────────────────────────────────

  const hasCurriculum = regulations.length > 0;
  const selectedBranch = branches.find((entry) => entry.value === branchId) ?? null;
  const selectedRegulation = regulations.find((entry) => entry.value === regulationId) ?? null;

  /**
   * The visible steps, computed from what the college actually has (§7).
   *
   * Regulation, semester and subjects drop out entirely for a college with no
   * curriculum, so the progress rail never promises a step the student cannot
   * reach.
   */
  const steps = useMemo<Step[]>(() => {
    const list: Step[] = ["state", "institution", "confirm", "course", "branch", "batch"];
    if (hasCurriculum) list.push("regulation", "semester", "subjects");
    else list.push("semester");
    list.push("graduation", "review");
    return list;
  }, [hasCurriculum]);

  const stepIndex = Math.max(0, steps.indexOf(step));

  const go = (next: Step) => {
    setError(null);
    setStep(next);
  };

  const advance = () => {
    const at = steps.indexOf(step);
    if (at >= 0 && at < steps.length - 1) go(steps[at + 1]);
  };

  const back = () => {
    const at = steps.indexOf(step);
    if (at > 0) go(steps[at - 1]);
  };

  const submit = useCallback(async () => {
    setSubmitting(true);
    setError(null);

    const response = await fetch("/api/profile/academic", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(selection),
    });
    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      setSubmitting(false);
      setError(payload?.error?.message ?? "Something is still missing.");
      const field = payload?.error?.details?.field as Step | undefined;
      if (field && steps.includes(field)) go(field);
      return;
    }

    /**
     * Refresh before navigating.
     *
     * The onboarding gate reads `profileCompleted` on the server, and the
     * router cache still holds the value from before this submit. Without the
     * refresh, the completion page can render against a stale profile and
     * bounce the student back into the flow they have just finished.
     */
    router.refresh();
    router.push("/onboarding/complete");
  }, [selection, steps, router]);

  const canContinue = ((): boolean => {
    switch (step) {
      case "state":
        return Boolean(stateId);
      case "institution":
        return Boolean(collegeId);
      case "confirm":
        return Boolean(college);
      case "course":
        return Boolean(degree);
      case "branch":
        return Boolean(branchId);
      case "batch":
        return admissionYear !== null;
      case "regulation":
        return Boolean(regulationId);
      case "semester":
        return hasCurriculum ? currentSemester !== null : currentYear !== null;
      case "subjects":
        // §25: an elective-only semester may legitimately have nothing ticked,
        // so the bar is "the list loaded", not "something is selected".
        return subjects.length === 0 || subjectIds.length > 0;
      case "graduation":
        return effectiveGraduation !== null;
      default:
        return true;
    }
  })();

  const thisYear = new Date().getFullYear();
  const batchYears = Array.from({ length: 9 }, (_, index) => thisYear + 1 - index);

  return (
    <div>
      {/* ── Progress (§40) ─────────────────────────────────────────────── */}
      <div className="mb-5">
        <div className="flex items-center justify-between">
          <p className="text-[12.5px] font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400">
            Academic Profile
          </p>
          <p className="text-[12px] text-slate-400 dark:text-slate-500">
            Step {stepIndex + 1} of {steps.length}
            {saving && <span className="ml-2 text-slate-400">saving…</span>}
          </p>
        </div>
        <div className="mt-2 flex gap-1" aria-hidden="true">
          {steps.map((entry, index) => (
            <span
              key={entry}
              className={`h-1.5 flex-1 rounded-full transition ${
                index < stepIndex
                  ? "bg-emerald-500"
                  : index === stepIndex
                    ? "bg-blue-600"
                    : "bg-slate-200 dark:bg-slate-700"
              }`}
            />
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_3px_rgba(15,23,42,0.04)] sm:p-7 dark:border-slate-800 dark:bg-slate-900">
        {error && (
          <p className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[13px] text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200">
            {error}
          </p>
        )}

        {step === "state" && (
          <Section title="Where do you study?" blurb="Pick your state so we can show the right institutions.">
            <div className="grid gap-2 sm:grid-cols-2">
              {states.map((entry) => (
                <Choice
                  key={entry.value}
                  active={stateId === entry.value}
                  title={entry.label}
                  onClick={() => changeState(entry.value)}
                />
              ))}
            </div>
            {comingSoon.length > 0 && (
              <p className="mt-3 text-[12.5px] text-slate-400 dark:text-slate-500">
                Other states coming soon — {comingSoon.slice(0, 6).join(", ")}
                {comingSoon.length > 6 ? ` and ${comingSoon.length - 6} more` : ""}.
              </p>
            )}
          </Section>
        )}

        {step === "institution" && (
          <Section title="Which institution?" blurb="Search for your college or university.">
            <Combobox
              label="College or university"
              value={institutionQuery}
              onChange={setInstitutionQuery}
              onSelect={(option: ComboboxOption) => {
                changeCollege(option.id);
                setInstitutionQuery(option.label);
              }}
              options={institutions
                .filter((entry) => entry.kind === "college")
                .map((entry) => ({
                  id: entry.value,
                  label: entry.label,
                  hint: [entry.affiliation, entry.location].filter(Boolean).join(" · ") || null,
                }))}
              placeholder="Start typing your institution's name"
              hint="Type at least two characters. The most popular institutions are listed first."
              emptyState={
                <button
                  type="button"
                  onClick={() => setRequestOpen(true)}
                  className="text-[13px] font-medium text-blue-700 hover:underline dark:text-blue-400"
                >
                  Can&apos;t find your college? Request it
                </button>
              }
            />

            {!requestOpen && (
              <button
                type="button"
                onClick={() => setRequestOpen(true)}
                className="mt-3 text-[13px] font-medium text-blue-700 hover:underline dark:text-blue-400"
              >
                Can&apos;t find your college?
              </button>
            )}

            {requestOpen && (
              <CollegeRequestForm
                stateId={stateId}
                onDone={(note, foundCollegeId) => {
                  setRequestNote(note);
                  setRequestOpen(false);
                  if (foundCollegeId) changeCollege(foundCollegeId);
                }}
                onCancel={() => setRequestOpen(false)}
              />
            )}

            {requestNote && (
              <p className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[12.5px] text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200">
                {requestNote}
              </p>
            )}
          </Section>
        )}

        {step === "confirm" && college && (
          <Section title="Is this correct?" blurb="Check the details we have for your institution.">
            <dl className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/50">
              <Row label="Institution" value={college.name} />
              <Row label="University" value={college.university ? `${college.university.name}${college.university.shortName ? ` (${college.university.shortName})` : ""}` : "Not affiliated / independent"} />
              <Row label="Institution Type" value={college.institutionType} />
              <Row label="Autonomous Status" value={AUTONOMY_LABELS[college.autonomyStatus] ?? college.autonomyStatus} />
              <Row label="Location" value={college.location || "—"} />
            </dl>
            <button
              type="button"
              onClick={() => go("institution")}
              className="mt-3 text-[13px] font-medium text-blue-700 hover:underline dark:text-blue-400"
            >
              Change institution
            </button>
          </Section>
        )}

        {step === "course" && (
          <Section title="What are you studying?" blurb="Your course at this institution.">
            <div className="grid gap-2 sm:grid-cols-2">
              {courses.map((entry) => (
                <Choice
                  key={entry.value}
                  active={degree === entry.value}
                  title={entry.label}
                  subtitle={[
                    entry.durationYears ? `${entry.durationYears} years` : null,
                    `${entry.branchCount} branch${entry.branchCount === 1 ? "" : "es"}`,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                  onClick={() => changeDegree(entry.value)}
                />
              ))}
            </div>
            {courses.length === 0 && (
              <Empty>No courses are listed for this institution yet.</Empty>
            )}
          </Section>
        )}

        {step === "branch" && (
          <Section title="Which branch?" blurb="Your specialization within the course.">
            <div className="grid gap-2 sm:grid-cols-2">
              {branches.map((entry) => (
                <Choice
                  key={entry.value}
                  active={branchId === entry.value}
                  title={entry.label}
                  subtitle={entry.code ?? undefined}
                  onClick={() => changeBranch(entry)}
                />
              ))}
            </div>
            {branches.length === 0 && <Empty>No branches are listed for this course yet.</Empty>}
          </Section>
        )}

        {step === "batch" && (
          <Section title="When did you join?" blurb="Your admission batch — not your current year.">
            <p className="mb-2 text-[13px] font-medium text-slate-700 dark:text-slate-300">Admission year</p>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
              {batchYears.map((year) => (
                <Choice key={year} active={admissionYear === year} title={String(year)} onClick={() => setAdmissionYear(year)} compact />
              ))}
            </div>

            <p className="mb-2 mt-5 text-[13px] font-medium text-slate-700 dark:text-slate-300">
              How were you admitted?
            </p>
            <div className="grid gap-2 sm:grid-cols-3">
              {[
                ["regular", "Regular", "Started in the first year"],
                ["lateral-entry", "Lateral Entry", "Joined in the second year"],
                ["other", "Other", "Transfer or something else"],
              ].map(([value, title, subtitle]) => (
                <Choice
                  key={value}
                  active={admissionType === value}
                  title={title}
                  subtitle={subtitle}
                  onClick={() => setAdmissionType(value)}
                />
              ))}
            </div>
          </Section>
        )}

        {step === "regulation" && (
          <Section
            title="Which regulation?"
            blurb="Your regulation determines your subjects, credits and curriculum — two students on the same course can have different ones."
          >
            <div className="grid gap-2">
              {regulations.map((entry) => (
                <Choice
                  key={entry.value}
                  active={regulationId === entry.value}
                  title={entry.label}
                  subtitle={[
                    entry.effectiveToYear
                      ? `${entry.effectiveFromYear}–${entry.effectiveToYear}`
                      : `${entry.effectiveFromYear} onward`,
                    entry.superseded ? "superseded — still valid for existing batches" : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                  onClick={() => changeRegulation(entry.value)}
                />
              ))}
            </div>
            {admissionYear && (
              <p className="mt-3 text-[12.5px] text-slate-400 dark:text-slate-500">
                You joined in {admissionYear}. If you are unsure, pick the regulation that was in
                effect that year.
              </p>
            )}
          </Section>
        )}

        {step === "semester" && (
          <Section
            title={hasCurriculum ? "Where are you now?" : "Which year are you in?"}
            blurb={
              hasCurriculum
                ? "Your current year and semester."
                : "Your college's semester-wise curriculum is not configured yet, so we only need your year for now."
            }
          >
            {hasCurriculum ? (
              <div className="grid gap-2 sm:grid-cols-2">
                {semesters.map((entry) => (
                  <Choice
                    key={entry.value}
                    active={currentSemester === entry.value}
                    title={entry.label}
                    subtitle={`${entry.subjectCount} subjects`}
                    onClick={() => changeSemester(entry.value)}
                  />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {Array.from({ length: duration ?? 4 }, (_, index) => index + 1).map((year) => (
                  <Choice
                    key={year}
                    active={currentYear === year}
                    title={`Year ${year}`}
                    onClick={() => setCurrentYear(year)}
                    compact
                  />
                ))}
              </div>
            )}
            {hasCurriculum && semesters.length === 0 && (
              <Empty>
                No semesters have subjects configured for {selectedRegulation?.label ?? "this regulation"} yet.
              </Empty>
            )}
          </Section>
        )}

        {step === "subjects" && (
          <Section
            title="Your subjects"
            blurb={`${degree} ${selectedBranch?.label ?? ""} · ${selectedRegulation?.label ?? ""} · Semester ${currentSemester}`}
          >
            <Combobox
              label="Search subjects"
              value={subjectQuery}
              onChange={setSubjectQuery}
              options={[]}
              placeholder="Filter by name or code"
            />

            <div className="mt-3 flex items-center justify-between">
              <p className="text-[12.5px] text-slate-500 dark:text-slate-400">
                {subjectIds.length} of {subjects.length} selected
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setSubjectIds(subjects.map((s) => s.value))}
                  className="text-[12.5px] font-medium text-blue-700 hover:underline dark:text-blue-400"
                >
                  Select all
                </button>
                <button
                  type="button"
                  onClick={() => setSubjectIds(subjects.filter((s) => s.required).map((s) => s.value))}
                  className="text-[12.5px] font-medium text-slate-500 hover:underline dark:text-slate-400"
                >
                  Required only
                </button>
              </div>
            </div>

            <ul className="mt-2 space-y-1.5">
              {subjects.map((subject) => {
                const checked = subjectIds.includes(subject.value);
                return (
                  <li key={subject.value}>
                    <label
                      className={`flex cursor-pointer items-start gap-2.5 rounded-lg border p-2.5 transition ${
                        checked
                          ? "border-blue-300 bg-blue-50 dark:border-blue-500/50 dark:bg-blue-500/10"
                          : "border-slate-200 bg-white hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() =>
                          setSubjectIds((current) =>
                            current.includes(subject.value)
                              ? current.filter((id) => id !== subject.value)
                              : [...current, subject.value]
                          )
                        }
                        className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-blue-600 dark:border-slate-600"
                      />
                      <span className="min-w-0">
                        <span className="block text-[13.5px] font-medium text-slate-800 dark:text-slate-100">
                          {subject.label}
                        </span>
                        <span className="block text-[12px] text-slate-500 dark:text-slate-400">
                          {[
                            subject.code,
                            subject.type,
                            subject.credits ? `${subject.credits} credits` : null,
                            subject.required ? "required" : "elective",
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>

            {subjects.length === 0 && <Empty>No subjects are configured for this semester yet.</Empty>}
          </Section>
        )}

        {step === "graduation" && (
          <Section title="When do you graduate?" blurb="We have worked this out from your batch — change it if it is wrong.">
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
              {Array.from({ length: 8 }, (_, index) => thisYear - 1 + index).map((year) => (
                <Choice key={year} active={effectiveGraduation === year} title={String(year)} onClick={() => setGraduationYear(year)} compact />
              ))}
            </div>
            {admissionYear && duration && (
              <p className="mt-3 text-[12.5px] text-slate-400 dark:text-slate-500">
                {admissionYear} + {admissionType === "lateral-entry" ? Math.max(1, duration - 1) : duration} years
                {admissionType === "lateral-entry" ? " (lateral entry)" : ""}
              </p>
            )}
          </Section>
        )}

        {step === "review" && (
          <Section title="Everything look right?" blurb="This becomes your academic identity across EduPilot.">
            <dl className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/50">
              <Row label="State" value={states.find((s) => s.value === stateId)?.label ?? "—"} onEdit={() => go("state")} />
              <Row label="Institution" value={college?.name ?? "—"} onEdit={() => go("institution")} />
              {college?.university && <Row label="University" value={college.university.shortName || college.university.name} />}
              <Row label="Institution Type" value={college ? `${college.institutionType} · ${AUTONOMY_LABELS[college.autonomyStatus] ?? college.autonomyStatus}` : "—"} />
              <Row label="Course" value={degree || "—"} onEdit={() => go("course")} />
              <Row label="Branch" value={selectedBranch?.label ?? "—"} onEdit={() => go("branch")} />
              {hasCurriculum && <Row label="Regulation" value={selectedRegulation?.label ?? "—"} onEdit={() => go("regulation")} />}
              <Row label="Admission Batch" value={admissionYear ? `${admissionYear}${admissionType !== "regular" ? ` · ${admissionType.replace("-", " ")}` : ""}` : "—"} onEdit={() => go("batch")} />
              <Row
                label={hasCurriculum ? "Year / Semester" : "Current Year"}
                value={
                  hasCurriculum
                    ? (semesters.find((s) => s.value === currentSemester)?.label ?? "—")
                    : currentYear
                      ? `Year ${currentYear}`
                      : "—"
                }
                onEdit={() => go("semester")}
              />
              {hasCurriculum && (
                <Row
                  label="Subjects"
                  value={
                    subjectIds.length
                      ? subjects
                          .filter((s) => subjectIds.includes(s.value))
                          .map((s) => s.label)
                          .join(", ")
                      : "None selected"
                  }
                  onEdit={() => go("subjects")}
                />
              )}
              <Row label="Expected Graduation" value={effectiveGraduation ? String(effectiveGraduation) : "—"} onEdit={() => go("graduation")} />
            </dl>

            {!hasCurriculum && (
              <p className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[12.5px] text-slate-600 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-300">
                Your college&apos;s regulation and semester-wise curriculum are not configured yet. Your
                profile is complete without them, and your subjects will appear automatically once they
                are added.
              </p>
            )}
          </Section>
        )}

        {/* ── Navigation (§41: sticky bottom continue) ─────────────────── */}
        <div className="mt-6 flex items-center justify-between gap-3 border-t border-slate-100 pt-4 dark:border-slate-800">
          <button
            type="button"
            onClick={back}
            disabled={stepIndex === 0 || submitting}
            className="rounded-lg px-3 py-2.5 text-[14px] font-medium text-slate-500 transition hover:bg-slate-100 disabled:opacity-40 dark:text-slate-400 dark:hover:bg-slate-800"
          >
            Back
          </button>

          {step === "review" ? (
            <button
              type="button"
              onClick={submit}
              disabled={submitting}
              className="flex-1 rounded-lg bg-blue-600 px-4 py-2.5 text-[15px] font-semibold text-white transition hover:bg-blue-700 disabled:opacity-60 sm:flex-none sm:px-6"
            >
              {submitting ? "Completing…" : "Complete profile"}
            </button>
          ) : (
            <button
              type="button"
              onClick={advance}
              disabled={!canContinue}
              className="flex-1 rounded-lg bg-blue-600 px-4 py-2.5 text-[15px] font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40 sm:flex-none sm:px-6"
            >
              Continue
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Presentational pieces ───────────────────────────────────────────────

function Section({ title, blurb, children }: { title: string; blurb?: string; children: React.ReactNode }) {
  return (
    <div>
      <h1 className="text-[21px] font-bold tracking-tight text-slate-900 dark:text-white sm:text-[24px]">
        {title}
      </h1>
      {blurb && (
        <p className="mt-1.5 text-[13.5px] leading-relaxed text-slate-500 dark:text-slate-400">{blurb}</p>
      )}
      <div className="mt-5">{children}</div>
    </div>
  );
}

/** A card-shaped option with a large touch target (§40, §41). */
function Choice({
  active,
  title,
  subtitle,
  onClick,
  compact,
}: {
  active: boolean;
  title: string;
  subtitle?: string;
  onClick: () => void;
  compact?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-xl border text-left transition ${compact ? "px-3 py-2.5" : "p-3.5"} ${
        active
          ? "border-blue-500 bg-blue-50 ring-1 ring-blue-500 dark:border-blue-500 dark:bg-blue-500/10"
          : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-slate-600"
      }`}
    >
      <span
        className={`block text-[14px] font-semibold ${
          active ? "text-blue-800 dark:text-blue-200" : "text-slate-800 dark:text-slate-100"
        }`}
      >
        {title}
      </span>
      {subtitle && (
        <span className="mt-0.5 block text-[12px] leading-snug text-slate-500 dark:text-slate-400">
          {subtitle}
        </span>
      )}
    </button>
  );
}

function Row({ label, value, onEdit }: { label: string; value: string; onEdit?: () => void }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <dt className="text-[11.5px] font-medium uppercase tracking-[0.05em] text-slate-400 dark:text-slate-500">
          {label}
        </dt>
        <dd className="mt-0.5 text-[13.5px] text-slate-800 dark:text-slate-100">{value}</dd>
      </div>
      {onEdit && (
        <button
          type="button"
          onClick={onEdit}
          className="shrink-0 text-[12.5px] font-medium text-blue-700 hover:underline dark:text-blue-400"
        >
          Change
        </button>
      )}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-[12.5px] text-slate-500 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-400">
      {children}
    </p>
  );
}

/** §36's request form, inline rather than a separate page. */
function CollegeRequestForm({
  stateId,
  onDone,
  onCancel,
}: {
  stateId: string;
  onDone: (note: string, collegeId?: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [universityHint, setUniversityHint] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const send = async () => {
    setBusy(true);
    setProblem(null);

    const response = await fetch("/api/colleges/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ collegeName: name, stateId, city, universityHint }),
    });
    const payload = await response.json().catch(() => null);
    setBusy(false);

    if (!response.ok) {
      setProblem(payload?.error?.message ?? "That could not be sent.");
      return;
    }
    onDone(payload.data.message, payload.data.collegeId ?? undefined);
  };

  return (
    <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3.5 dark:border-slate-700 dark:bg-slate-800/50">
      <p className="text-[13px] font-semibold text-slate-800 dark:text-slate-100">Request your college</p>
      <p className="mt-0.5 text-[12.5px] text-slate-500 dark:text-slate-400">
        We will review it and email you when it is added.
      </p>

      <div className="mt-3 space-y-2">
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Full college name"
          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[14px] dark:border-slate-700 dark:bg-slate-900 dark:text-white"
        />
        <div className="grid gap-2 sm:grid-cols-2">
          <input
            value={city}
            onChange={(event) => setCity(event.target.value)}
            placeholder="City (optional)"
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[14px] dark:border-slate-700 dark:bg-slate-900 dark:text-white"
          />
          <input
            value={universityHint}
            onChange={(event) => setUniversityHint(event.target.value)}
            placeholder="Affiliated to (optional)"
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[14px] dark:border-slate-700 dark:bg-slate-900 dark:text-white"
          />
        </div>
      </div>

      {problem && <p className="mt-2 text-[12.5px] text-rose-700 dark:text-rose-400">{problem}</p>}

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={send}
          disabled={busy || name.trim().length < 4}
          className="rounded-lg bg-slate-900 px-3 py-2 text-[13.5px] font-semibold text-white disabled:opacity-50 dark:bg-white dark:text-slate-900"
        >
          {busy ? "Sending…" : "Send request"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg px-3 py-2 text-[13.5px] font-medium text-slate-500 dark:text-slate-400"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
