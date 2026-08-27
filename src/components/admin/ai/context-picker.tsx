"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

/**
 * The cascading academic context picker (spec §4, §5, §6).
 *
 * Seven dependent selects. Each one is disabled until the step before it has an
 * answer, and choosing a step clears everything after it — a branch left over
 * from a previous college is the exact mix-up §44 forbids, and the cheapest way
 * to make it impossible is for the state to be unable to hold it.
 *
 * Options are fetched from `/api/admin/ai/cascade`, never derived here. The
 * browser holds ids and labels for display; the *meaning* of a selection is
 * re-resolved server-side before anything is generated (§10, §26), so nothing
 * this component sends is trusted.
 *
 * **Loading is derived, not stored.** A step is loading when its dependency is
 * satisfied but no fetch has returned for it yet. Setting a flag at the top of
 * each effect would be a synchronous `setState` inside an effect body, which
 * this repo's lint rules reject and which causes a cascade of renders — one per
 * step, seven deep.
 */

type Option = { value: string; label: string; hint?: string; count?: number };
type BranchOption = Option & { programId: string; programName: string };
type SemesterOption = Option & { year: number; semester: number };

export type SelectedContext = {
  collegeId: string;
  collegeName: string;
  degree: string;
  branchId: string;
  branchName: string;
  programId: string;
  programName: string;
  regulationId: string;
  regulationCode: string;
  academicYearId: string;
  academicYearLabel: string;
  year: number;
  semester: number;
  semesterLabel: string;
  subjectId: string;
  subjectName: string;
};

export type SubjectDetail = {
  id: string;
  name: string;
  code: string;
  credits: number | null;
  lectureHours: number | null;
  tutorialHours: number | null;
  practicalHours: number | null;
  courseType: string;
  year: number;
  semester: number;
  regulationCode: string | null;
  prerequisites: string[];
  learningObjectives: string[];
  outcomes: string[];
  syllabusText: string | null;
  units: { unitNumber: number; title: string; description: string | null; topics: string[]; hours: number | null }[];
  referenceBooks: { title: string; authors: string | null; publisher: string | null; edition: string | null; kind: string }[];
  referenceMaterials: string[];
  hasSyllabus: boolean;
};

const STEPS = ["college", "course", "branch", "regulation", "academicYear", "semester", "subject"] as const;
type Step = (typeof STEPS)[number];

/** What each step needs before it can load, and the label for the message. */
const DEPENDS_ON: Record<Step, Step | null> = {
  college: null,
  course: "college",
  branch: "course",
  regulation: "branch",
  academicYear: "regulation",
  semester: "academicYear",
  subject: "semester",
};

const DEPENDS_LABEL: Record<Step, string> = {
  college: "",
  course: "a college",
  branch: "a course",
  regulation: "a branch",
  academicYear: "a regulation",
  semester: "an academic year",
  subject: "a semester",
};

const EMPTY: Record<Step, string> = {
  college: "",
  course: "",
  branch: "",
  regulation: "",
  academicYear: "",
  semester: "",
  subject: "",
};

const NO_OPTIONS: Record<Step, Option[]> = {
  college: [],
  course: [],
  branch: [],
  regulation: [],
  academicYear: [],
  semester: [],
  subject: [],
};

const NOT_LOADED: Record<Step, boolean> = {
  college: false,
  course: false,
  branch: false,
  regulation: false,
  academicYear: false,
  semester: false,
  subject: false,
};

async function fetchStep(step: string, query: Record<string, string>): Promise<Option[]> {
  const params = new URLSearchParams({ step, ...query });
  const response = await fetch(`/api/admin/ai/cascade?${params}`, { cache: "no-store" });
  if (!response.ok) return [];
  const payload = await response.json();
  return (payload?.data?.options ?? []) as Option[];
}

export function ContextPicker({
  onChange,
  onSubjectLoaded,
}: {
  onChange: (context: SelectedContext | null) => void;
  onSubjectLoaded?: (subject: SubjectDetail | null) => void;
}) {
  const [values, setValues] = useState<Record<Step, string>>(EMPTY);
  const [options, setOptions] = useState<Record<Step, Option[]>>(NO_OPTIONS);
  const [loaded, setLoaded] = useState<Record<Step, boolean>>(NOT_LOADED);
  const [collegeQuery, setCollegeQuery] = useState("");
  const [subject, setSubject] = useState<SubjectDetail | null>(null);

  /** Record a step's result. The only place options and `loaded` are written. */
  const receive = useCallback((step: Step, list: Option[]) => {
    setOptions((current) => ({ ...current, [step]: list }));
    setLoaded((current) => ({ ...current, [step]: true }));
  }, []);

  /**
   * Set one step and clear everything downstream.
   *
   * The clear is the important half. Without it, changing the college while a
   * subject is selected would leave a subject id from the old college in state,
   * and the request would carry a coordinate that has never existed.
   *
   * Done in the event handler rather than an effect, which is why the subject
   * panel can be cleared here without a synchronous effect write.
   */
  const select = useCallback(
    (step: Step, value: string) => {
      const from = STEPS.indexOf(step);
      const downstream = STEPS.slice(from + 1);

      setValues((current) => {
        const next = { ...current, [step]: value };
        for (const later of downstream) next[later] = "";
        return next;
      });
      setOptions((current) => {
        const next = { ...current };
        for (const later of downstream) next[later] = [];
        return next;
      });
      setLoaded((current) => {
        const next = { ...current };
        for (const later of downstream) next[later] = false;
        return next;
      });

      if (step !== "subject") {
        setSubject(null);
        onSubjectLoaded?.(null);
      }
    },
    [onSubjectLoaded]
  );

  const branch = useMemo(
    () => (options.branch as BranchOption[]).find((entry) => entry.value === values.branch) ?? null,
    [options.branch, values.branch]
  );

  // ── Loading each step. Every setState is inside an async continuation. ──

  useEffect(() => {
    let live = true;
    const query = collegeQuery.trim();
    fetchStep("colleges", query.length >= 2 ? { q: query } : {}).then((list) => {
      if (live) receive("college", list);
    });
    return () => {
      live = false;
    };
  }, [collegeQuery, receive]);

  useEffect(() => {
    if (!values.college) return;
    let live = true;
    fetchStep("courses", { collegeId: values.college }).then((list) => {
      if (!live) return;
      receive("course", list);
      // A college with one degree needs no decision made about it.
      if (list.length === 1) select("course", list[0].value);
    });
    return () => {
      live = false;
    };
  }, [values.college, receive, select]);

  useEffect(() => {
    if (!values.college || !values.course) return;
    let live = true;
    fetchStep("branches", { collegeId: values.college, degree: values.course }).then((list) => {
      if (live) receive("branch", list);
    });
    return () => {
      live = false;
    };
  }, [values.college, values.course, receive]);

  useEffect(() => {
    if (!values.college || !values.course || !branch) return;
    let live = true;
    fetchStep("regulations", {
      collegeId: values.college,
      degree: values.course,
      programId: branch.programId,
    }).then((list) => {
      if (live) receive("regulation", list);
    });
    return () => {
      live = false;
    };
  }, [values.college, values.course, branch, receive]);

  useEffect(() => {
    if (!values.regulation) return;
    let live = true;
    fetchStep("academic-years", { regulationId: values.regulation }).then((list) => {
      if (live) receive("academicYear", list);
    });
    return () => {
      live = false;
    };
  }, [values.regulation, receive]);

  useEffect(() => {
    if (!values.regulation || !values.academicYear || !values.branch) return;
    let live = true;
    fetchStep("semesters", { regulationId: values.regulation, branchId: values.branch }).then((list) => {
      if (live) receive("semester", list);
    });
    return () => {
      live = false;
    };
  }, [values.regulation, values.academicYear, values.branch, receive]);

  useEffect(() => {
    if (!values.college || !branch || !values.regulation || !values.semester) return;
    let live = true;
    fetchStep("subjects", {
      collegeId: values.college,
      programId: branch.programId,
      branchId: values.branch,
      regulationId: values.regulation,
      semester: values.semester,
    }).then((list) => {
      if (live) receive("subject", list);
    });
    return () => {
      live = false;
    };
  }, [values.college, branch, values.branch, values.regulation, values.semester, receive]);

  // ── Subject metadata (§6) ─────────────────────────────────────────────

  useEffect(() => {
    if (!values.subject) return;

    let live = true;
    fetch(`/api/admin/ai/cascade?step=subject&subjectId=${values.subject}`, { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        if (!live) return;
        const detail = (payload?.data?.subject ?? null) as SubjectDetail | null;
        setSubject(detail);
        onSubjectLoaded?.(detail);
      });

    return () => {
      live = false;
    };
  }, [values.subject, onSubjectLoaded]);

  // ── Report the completed context upward ───────────────────────────────

  useEffect(() => {
    const semesterOption = (options.semester as SemesterOption[]).find(
      (entry) => entry.value === values.semester
    );

    const complete =
      values.college &&
      values.course &&
      branch &&
      values.regulation &&
      values.academicYear &&
      semesterOption &&
      values.subject;

    if (!complete) {
      onChange(null);
      return;
    }

    const label = (step: Step) => options[step].find((entry) => entry.value === values[step])?.label ?? "";

    onChange({
      collegeId: values.college,
      collegeName: label("college"),
      degree: values.course,
      branchId: values.branch,
      branchName: branch.label,
      programId: branch.programId,
      programName: branch.programName,
      regulationId: values.regulation,
      regulationCode: label("regulation"),
      academicYearId: values.academicYear,
      academicYearLabel: label("academicYear"),
      year: semesterOption.year,
      semester: semesterOption.semester,
      semesterLabel: semesterOption.label,
      subjectId: values.subject,
      subjectName: label("subject"),
    });
  }, [values, options, branch, onChange]);

  const step = (name: Step, label: string, placeholder: string) => {
    const dependency = DEPENDS_ON[name];
    const enabled = !dependency || Boolean(values[dependency]);
    const list = options[name];
    // Derived: the dependency is met but nothing has come back yet.
    const isLoading = enabled && !loaded[name];

    return (
      <label className="block">
        <span className="mb-1 flex items-center gap-1.5 text-[12px] font-medium text-slate-600 dark:text-slate-300">
          {label}
          {isLoading && <span className="text-[11px] font-normal text-slate-400">loading…</span>}
        </span>
        <select
          value={values[name]}
          disabled={!enabled || isLoading}
          onChange={(event) => select(name, event.target.value)}
          className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-[13px] text-slate-800 transition disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:disabled:bg-slate-800/50"
        >
          <option value="">
            {!enabled
              ? `Select ${DEPENDS_LABEL[name]} first`
              : isLoading
                ? "Loading…"
                : list.length === 0
                  ? "No options available"
                  : placeholder}
          </option>
          {list.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
              {option.hint ? ` — ${option.hint}` : ""}
              {option.count ? ` (${option.count})` : ""}
            </option>
          ))}
        </select>
      </label>
    );
  };

  return (
    <div className="space-y-3">
      <label className="block">
        <span className="mb-1 block text-[12px] font-medium text-slate-600 dark:text-slate-300">
          Find a college
        </span>
        <input
          type="search"
          value={collegeQuery}
          onChange={(event) => setCollegeQuery(event.target.value)}
          placeholder="Type at least two characters — name, code or city"
          className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-[13px] text-slate-800 placeholder:text-slate-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
        />
      </label>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {step("college", "1 · College", "Select college")}
        {step("course", "2 · Course / Program", "Select course")}
        {step("branch", "3 · Branch", "Select branch")}
        {step("regulation", "4 · Regulation", "Select regulation")}
        {step("academicYear", "5 · Academic Year", "Select academic year")}
        {step("semester", "6 · Year / Semester", "Select semester")}
        {step("subject", "7 · Subject", "Select subject")}
      </div>

      {subject && !subject.hasSyllabus && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12.5px] text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
          <strong className="font-semibold">No syllabus on record.</strong> {subject.name} has no units,
          so course-structured content cannot be grounded on the curriculum. Add the syllabus to the
          subject, or upload it as source material, before generating.
        </p>
      )}
    </div>
  );
}
