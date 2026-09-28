"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { UsersIcon } from "@/components/icons";
import { SUBMISSION_TYPES, SUBMISSION_TYPE_LABELS } from "@/lib/teaching/fields";
import type { SubmissionType } from "@/lib/teaching/fields";
import type { AcademicContextTree } from "@/lib/teaching/teacher";

/**
 * Creating an assignment (§12, §14, §15).
 *
 * The cascade — year → programme → branch → regulation → semester → subject —
 * runs entirely in the browser over a tree the server already narrowed to what
 * this teacher may touch. Five dependent requests to walk a few dozen rows
 * would be five round trips on the screen a teacher opens before everything
 * they do, and the narrowing is over a list small enough that the browser does
 * it instantly.
 *
 * **The teacher never picks students.** Choosing a subject *is* choosing the
 * audience, and the preview panel says how many that is before they publish
 * (§15, §102). The count comes from the server — the same resolver the publish
 * uses — because a preview that disagreed with the publish would be worse than
 * no preview at all.
 *
 * Saving and publishing are separate buttons on purpose (§16). Publishing
 * writes a row per student and fans out notifications; doing it implicitly on
 * submit would mean a mistyped deadline has already reached two hundred people.
 */

type Draft = {
  subjectId: string;
  title: string;
  description: string;
  instructions: string;
  submissionType: SubmissionType;
  maxMarks: string;
  dueAt: string;
  allowLateSubmission: boolean;
  lateSubmissionUntil: string;
};

const EMPTY: Draft = {
  subjectId: "",
  title: "",
  description: "",
  instructions: "",
  submissionType: "text",
  maxMarks: "",
  dueAt: "",
  allowLateSubmission: false,
  lateSubmissionUntil: "",
};

export function AssignmentForm({
  context,
  canPublish,
}: {
  context: AcademicContextTree;
  canPublish: boolean;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Every subject, flattened, with the path that reaches it.
   *
   * The cascade is rendered from this rather than from nested state: a teacher
   * with three subjects should not have to make four choices to reach one, so
   * the selects narrow the list and the list is always directly selectable.
   */
  const subjects = useMemo(() => flatten(context), [context]);

  const [programId, setProgramId] = useState("");
  const [branchId, setBranchId] = useState("");
  const [semester, setSemester] = useState("");

  const visible = subjects.filter(
    (subject) =>
      (!programId || subject.programId === programId) &&
      (!branchId || subject.branchId === branchId) &&
      (!semester || String(subject.semester) === semester)
  );

  const chosen = subjects.find((subject) => subject.subjectId === draft.subjectId) ?? null;

  async function save(publish: boolean) {
    if (busy) return;
    setBusy(true);
    setError(null);

    try {
      const response = await fetch("/api/teacher/assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subjectId: draft.subjectId,
          title: draft.title,
          description: draft.description || null,
          instructions: draft.instructions || null,
          submissionType: draft.submissionType,
          maxMarks: draft.maxMarks ? Number(draft.maxMarks) : null,
          dueAt: draft.dueAt ? new Date(draft.dueAt).toISOString() : "",
          allowLateSubmission: draft.allowLateSubmission,
          lateSubmissionUntil: draft.lateSubmissionUntil
            ? new Date(draft.lateSubmissionUntil).toISOString()
            : "",
        }),
      });

      const payload = (await response.json().catch(() => null)) as
        | { data?: { id?: string; eligibleStudents?: number }; error?: { message?: string } }
        | null;

      if (!response.ok || !payload?.data?.id) {
        setError(payload?.error?.message ?? "That could not be saved. Check the form and try again.");
        return;
      }

      const id = payload.data.id;

      if (!publish) {
        router.push(`/teacher/assignments/${id}`);
        return;
      }

      const published = await fetch(`/api/teacher/assignments/${id}/publish`, { method: "POST" });
      const publishPayload = (await published.json().catch(() => null)) as
        | { data?: { eligibleStudents?: number; warning?: string | null }; error?: { message?: string } }
        | null;

      if (!published.ok) {
        // The draft exists. Saying so matters — otherwise the teacher retypes
        // everything after a validation failure at the publish step.
        setError(
          `${publishPayload?.error?.message ?? "That could not be published."} Your draft has been saved.`
        );
        return;
      }

      router.push(`/teacher/assignments/${id}/submissions`);
    } catch {
      setError("The connection dropped. Check your network and try again.");
    } finally {
      setBusy(false);
    }
  }

  if (subjects.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200/80 bg-white p-8 text-center dark:border-slate-800 dark:bg-slate-900">
        <p className="text-[15px] font-semibold text-slate-900 dark:text-white">
          No subjects assigned
        </p>
        <p className="mx-auto mt-1.5 max-w-md text-[13.5px] leading-relaxed text-slate-500 dark:text-slate-400">
          Your college decides which subjects you teach. Until one is assigned there is nothing to
          set work for.
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void save(false);
      }}
      className="space-y-5"
    >
      <section className="rounded-2xl border border-slate-200/80 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-[15px] font-semibold text-slate-900 dark:text-white">
          Who is this for?
        </h2>
        <p className="mt-0.5 text-[12.5px] text-slate-400 dark:text-slate-500">
          Pick the subject. Every student currently in that year and semester will receive it —
          you do not choose them individually.
        </p>

        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <Select
            id="program"
            label="Course"
            value={programId}
            onChange={(value) => {
              setProgramId(value);
              setBranchId("");
              setDraft((current) => ({ ...current, subjectId: "" }));
            }}
            options={unique(subjects.map((s) => [s.programId, s.programName]))}
          />
          <Select
            id="branch"
            label="Branch"
            value={branchId}
            onChange={(value) => {
              setBranchId(value);
              setDraft((current) => ({ ...current, subjectId: "" }));
            }}
            options={unique(
              subjects
                .filter((s) => !programId || s.programId === programId)
                .map((s) => [s.branchId, s.branchName])
            )}
          />
          <Select
            id="semester"
            label="Semester"
            value={semester}
            onChange={(value) => {
              setSemester(value);
              setDraft((current) => ({ ...current, subjectId: "" }));
            }}
            options={unique(
              subjects
                .filter((s) => !branchId || s.branchId === branchId)
                .map((s) => [String(s.semester), `Year ${s.year}, Semester ${s.semester}`])
            )}
          />
        </div>

        <div className="mt-3">
          <label htmlFor="subject" className="block text-[12.5px] font-semibold text-slate-600 dark:text-slate-300">
            Subject
          </label>
          <select
            id="subject"
            required
            value={draft.subjectId}
            onChange={(event) =>
              setDraft((current) => ({ ...current, subjectId: event.target.value }))
            }
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-[14px] text-slate-700 outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            <option value="">Choose a subject</option>
            {visible.map((subject) => (
              <option key={subject.subjectId} value={subject.subjectId}>
                {subject.code} — {subject.name}
              </option>
            ))}
          </select>
        </div>

        {chosen && (
          <div className="mt-3 rounded-xl border border-blue-200/70 bg-blue-50/60 p-3.5 dark:border-blue-500/20 dark:bg-blue-500/10">
            <p className="flex items-center gap-2 text-[12.5px] font-semibold text-blue-900 dark:text-blue-200">
              <UsersIcon className="h-4 w-4" />
              Target audience
            </p>
            <p className="mt-1 text-[13px] leading-relaxed text-blue-900/90 dark:text-blue-100/90">
              {context.collegeName} · {chosen.programName} · {chosen.branchName} ·{" "}
              {chosen.regulationCode} · Year {chosen.year}, Semester {chosen.semester} ·{" "}
              {chosen.name}
            </p>
            <p className="mt-1.5 text-[12px] text-blue-900/70 dark:text-blue-100/70">
              {/*
                The number is reported by the server at save time, not guessed
                here. Saying "counted when you publish" is honest; showing a
                client-side estimate that then disagrees is not.
              */}
              Every student currently in that semester will receive it. The exact number is
              confirmed when you save.
            </p>
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200/80 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-[15px] font-semibold text-slate-900 dark:text-white">The work</h2>

        <div className="mt-3 space-y-3">
          <Field
            id="title"
            label="Title"
            required
            value={draft.title}
            onChange={(value) => setDraft((current) => ({ ...current, title: value }))}
            placeholder="Implement a Binary Search Tree"
          />

          <div>
            <label htmlFor="instructions" className="block text-[12.5px] font-semibold text-slate-600 dark:text-slate-300">
              Instructions
            </label>
            <textarea
              id="instructions"
              rows={6}
              value={draft.instructions}
              onChange={(event) =>
                setDraft((current) => ({ ...current, instructions: event.target.value }))
              }
              placeholder="What the student has to do, and how it will be marked."
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-[14px] text-slate-700 outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="submissionType" className="block text-[12.5px] font-semibold text-slate-600 dark:text-slate-300">
                How should they hand it in?
              </label>
              <select
                id="submissionType"
                value={draft.submissionType}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    submissionType: event.target.value as SubmissionType,
                  }))
                }
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-[14px] text-slate-700 outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                {SUBMISSION_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {SUBMISSION_TYPE_LABELS[type]}
                  </option>
                ))}
              </select>
            </div>

            <Field
              id="maxMarks"
              label="Marks"
              type="number"
              value={draft.maxMarks}
              onChange={(value) => setDraft((current) => ({ ...current, maxMarks: value }))}
              placeholder="10"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              id="dueAt"
              label="Due"
              type="datetime-local"
              value={draft.dueAt}
              onChange={(value) => setDraft((current) => ({ ...current, dueAt: value }))}
            />

            <div className="flex flex-col justify-end">
              <label className="flex items-center gap-2 text-[13.5px] text-slate-700 dark:text-slate-200">
                <input
                  type="checkbox"
                  checked={draft.allowLateSubmission}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      allowLateSubmission: event.target.checked,
                    }))
                  }
                  className="h-4 w-4 rounded border-slate-300"
                />
                Accept late submissions
              </label>

              {draft.allowLateSubmission && (
                <input
                  type="datetime-local"
                  aria-label="Late submissions accepted until"
                  value={draft.lateSubmissionUntil}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      lateSubmissionUntil: event.target.value,
                    }))
                  }
                  className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-[13.5px] text-slate-700 outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                />
              )}
            </div>
          </div>
        </div>
      </section>

      {error && (
        <p role="alert" className="rounded-lg bg-rose-50 px-3.5 py-2.5 text-[13.5px] text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-2.5">
        <button
          type="submit"
          disabled={busy || !draft.subjectId || !draft.title.trim()}
          className="rounded-lg border border-slate-200 px-4 py-2.5 text-[14px] font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          {busy ? "Saving..." : "Save as draft"}
        </button>

        <button
          type="button"
          disabled={busy || !canPublish || !draft.subjectId || !draft.title.trim()}
          onClick={() => void save(true)}
          className="rounded-lg bg-blue-600 px-5 py-2.5 text-[14px] font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-500/25"
        >
          {busy ? "Working..." : "Save and publish"}
        </button>

        {!canPublish && (
          <p className="self-center text-[12.5px] text-slate-400">
            Publishing opens up once your account is approved and your email is confirmed.
          </p>
        )}
      </div>
    </form>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────

type FlatSubject = {
  subjectId: string;
  name: string;
  code: string;
  programId: string;
  programName: string;
  branchId: string;
  branchName: string;
  regulationId: string;
  regulationCode: string;
  year: number;
  semester: number;
};

function flatten(context: AcademicContextTree): FlatSubject[] {
  const out: FlatSubject[] = [];

  for (const program of context.programs) {
    for (const branch of program.branches) {
      for (const regulation of branch.regulations) {
        for (const semester of regulation.semesters) {
          for (const subject of semester.subjects) {
            out.push({
              subjectId: subject.subjectId,
              name: subject.name,
              code: subject.code,
              programId: program.programId,
              programName: program.programName,
              branchId: branch.branchId,
              branchName: branch.branchName,
              regulationId: regulation.regulationId,
              regulationCode: regulation.regulationCode,
              year: semester.year,
              semester: semester.semester,
            });
          }
        }
      }
    }
  }

  return out;
}

function unique(pairs: [string, string][]): { value: string; label: string }[] {
  const seen = new Map<string, string>();
  for (const [value, label] of pairs) if (!seen.has(value)) seen.set(value, label);
  return [...seen].map(([value, label]) => ({ value, label }));
}

function Select({
  id,
  label,
  value,
  onChange,
  options,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-[12.5px] font-semibold text-slate-600 dark:text-slate-300">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-[14px] text-slate-700 outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
      >
        <option value="">All</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  type = "text",
  required,
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-[12.5px] font-semibold text-slate-600 dark:text-slate-300">
        {label}
      </label>
      <input
        id={id}
        type={type}
        required={required}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-[14px] text-slate-700 outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
      />
    </div>
  );
}
