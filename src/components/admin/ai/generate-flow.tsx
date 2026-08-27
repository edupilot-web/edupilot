"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { BUTTON_STYLES, Badge, Card } from "@/components/admin/ui";
import {
  ContextPicker,
  type SelectedContext,
  type SubjectDetail,
} from "@/components/admin/ai/context-picker";
import { ContextSummary, SubjectInformation } from "@/components/admin/ai/subject-panels";
import {
  AI_CONTENT_LENGTHS,
  AI_CONTENT_LENGTH_LABELS,
  AI_CONTENT_LEVELS,
  AI_CONTENT_LEVEL_LABELS,
  AI_CONTENT_TYPE_GROUPS,
  AI_CONTENT_TYPE_META,
  AI_DIFFICULTIES,
  AI_DIFFICULTY_LABELS,
  AI_LANGUAGES,
  AI_LANGUAGE_LABELS,
  AI_TEACHING_STYLES,
  AI_TEACHING_STYLE_LABELS,
  type AiContentType,
} from "@/lib/admin/ai/fields";

/**
 * The generation flow (spec §7, §8, §19, §27, §37).
 *
 * One client component for the whole path — context, content type,
 * configuration, submit, progress — because every step depends on the one before
 * it and splitting them across routes would mean serialising a half-built
 * request into a URL.
 *
 * The submit is fire-and-poll (§19). It posts, gets a job reference, and polls
 * the job endpoint; the browser never holds a request open while a model runs.
 */

type Phase = "selecting" | "submitting" | "running" | "done" | "error";

type JobState = {
  id: string;
  reference: string;
  status: string;
  error: string | null;
  errorCode: string | null;
  contentId: string | null;
  warnings: { message: string }[];
  versionNumber: number | null;
  usingMock: boolean;
  provider: string;
  model: string;
};

type DuplicateInfo = {
  id: string;
  status: string;
  versionCount: number;
  coveredUnits: number[];
};

const POLL_MS = 1200;
/** Give up polling after this long and tell the operator to check the job list. */
const POLL_TIMEOUT_MS = 5 * 60 * 1000;

export function GenerateFlow({ canGenerate }: { canGenerate: boolean }) {
  const [context, setContext] = useState<SelectedContext | null>(null);
  const [subject, setSubject] = useState<SubjectDetail | null>(null);

  const [contentType, setContentType] = useState<AiContentType>("complete-course");
  const [unitNumber, setUnitNumber] = useState<number | null>(null);

  const [level, setLevel] = useState<string>("undergraduate");
  const [language, setLanguage] = useState<string>("english");
  const [length, setLength] = useState<string>("standard");
  const [difficulty, setDifficulty] = useState<string>("moderate");
  const [styles, setStyles] = useState<string[]>(["academic"]);
  const [instructions, setInstructions] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [phase, setPhase] = useState<Phase>("selecting");
  const [job, setJob] = useState<JobState | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState<DuplicateInfo | null>(null);

  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollStarted = useRef<number>(0);

  useEffect(() => {
    return () => {
      if (pollTimer.current) clearTimeout(pollTimer.current);
    };
  }, []);

  const meta = AI_CONTENT_TYPE_META.find((entry) => entry.key === contentType);
  const needsUnit = meta?.scope === "unit" || meta?.scope === "topic";

  const onSubjectLoaded = useCallback((detail: SubjectDetail | null) => {
    setSubject(detail);
    setUnitNumber(null);
    // §8: the default level follows the programme rather than being fixed.
    if (detail) setLevel(detail.year >= 3 ? "advanced" : "undergraduate");
  }, []);

  const poll = useCallback((jobId: string) => {
    const tick = async () => {
      if (Date.now() - pollStarted.current > POLL_TIMEOUT_MS) {
        setPhase("error");
        setMessage(
          "The job is taking longer than expected. It is still running — check AI Generation Jobs for the outcome."
        );
        return;
      }

      const response = await fetch(`/api/admin/ai/generation-jobs/${jobId}`, { cache: "no-store" });
      if (!response.ok) {
        setPhase("error");
        setMessage("The job status could not be read. Check AI Generation Jobs.");
        return;
      }

      const payload = await response.json();
      const data = payload?.data?.job;
      if (!data) return;

      setJob((current) =>
        current
          ? {
              ...current,
              status: data.status,
              error: data.error ?? null,
              errorCode: data.errorCode ?? null,
              contentId: data.courseContentId ?? current.contentId,
              warnings: Array.isArray(data.result?.warnings) ? data.result.warnings : [],
              versionNumber: data.result?.versionNumber ?? null,
            }
          : current
      );

      if (data.status === "completed") {
        setPhase("done");
        return;
      }
      if (data.status === "failed" || data.status === "cancelled") {
        setPhase("error");
        setMessage(data.error ?? "The generation failed.");
        return;
      }

      pollTimer.current = setTimeout(tick, POLL_MS);
    };

    pollStarted.current = Date.now();
    pollTimer.current = setTimeout(tick, POLL_MS);
  }, []);

  const submit = useCallback(
    async (onDuplicate: "reject" | "new-version" | "replace-draft") => {
      if (!context) return;

      setPhase("submitting");
      setMessage(null);
      setDuplicate(null);

      const response = await fetch("/api/admin/ai/course-content/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // Ids only. Every label on this screen is for the operator's benefit;
          // the server re-resolves the context from these (§10).
          collegeId: context.collegeId,
          programId: context.programId,
          branchId: context.branchId,
          regulationId: context.regulationId,
          academicYearId: context.academicYearId,
          semester: context.semester,
          subjectId: context.subjectId,
          contentType,
          options: {
            level,
            language,
            length,
            difficulty,
            teachingStyles: styles,
            instructions: instructions.trim() || null,
            unitNumber: needsUnit ? unitNumber : null,
          },
          onDuplicate,
        }),
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        const error = payload?.error;
        setPhase("error");
        setMessage(error?.message ?? "The request was refused.");

        // §27: offer the four choices rather than a dead end.
        if (error?.code === "content-exists" && error?.details?.existing) {
          setDuplicate(error.details.existing as DuplicateInfo);
        }
        return;
      }

      const data = payload?.data;
      setJob({
        id: data.jobId,
        reference: data.jobReference,
        status: "queued",
        error: null,
        errorCode: null,
        contentId: data.courseContentId,
        warnings: [],
        versionNumber: null,
        usingMock: data.usingMock === true,
        provider: data.provider,
        model: data.model,
      });
      setPhase("running");
      poll(data.jobId);
    },
    [context, contentType, level, language, length, difficulty, styles, instructions, needsUnit, unitNumber, poll]
  );

  const reset = () => {
    if (pollTimer.current) clearTimeout(pollTimer.current);
    setPhase("selecting");
    setJob(null);
    setMessage(null);
    setDuplicate(null);
  };

  const busy = phase === "submitting" || phase === "running";

  return (
    <div className="space-y-3">
      <Card title="Select Academic Context" description="Every step is filtered by the one before it. Subjects come from the mapping for this exact college, regulation and semester.">
        <ContextPicker onChange={setContext} onSubjectLoaded={onSubjectLoaded} />
      </Card>

      {context && <ContextSummary context={context} subject={subject} />}
      {subject && <SubjectInformation subject={subject} />}

      {context && subject && (
        <>
          <Card title="Generate Course Content" description="Pick what to generate. Each type is versioned independently, so a missing section can be filled without regenerating the subject.">
            <div className="space-y-4">
              {AI_CONTENT_TYPE_GROUPS.map((group) => (
                <div key={group.key}>
                  <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-400 dark:text-slate-500">
                    {group.label}
                  </p>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {AI_CONTENT_TYPE_META.filter((entry) => entry.group === group.key).map((entry) => {
                      const active = entry.key === contentType;
                      return (
                        <button
                          key={entry.key}
                          type="button"
                          onClick={() => setContentType(entry.key)}
                          aria-pressed={active}
                          disabled={busy}
                          className={`rounded-lg border p-2.5 text-left transition disabled:opacity-60 ${
                            active
                              ? "border-blue-300 bg-blue-50 ring-1 ring-blue-300 dark:border-blue-500/50 dark:bg-blue-500/10 dark:ring-blue-500/40"
                              : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700"
                          }`}
                        >
                          <span className="flex items-center gap-1.5">
                            <span className={`text-[12.5px] font-medium ${active ? "text-blue-800 dark:text-blue-200" : "text-slate-800 dark:text-slate-100"}`}>
                              {entry.label}
                            </span>
                            {entry.composite && <Badge tone="info">multi</Badge>}
                          </span>
                          <span className="mt-0.5 block text-[11.5px] leading-snug text-slate-500 dark:text-slate-400">
                            {entry.blurb}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}

              {needsUnit && (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-800/40">
                  <label className="block">
                    <span className="mb-1 block text-[12px] font-medium text-slate-600 dark:text-slate-300">
                      Which unit? {meta?.label} is generated one unit at a time.
                    </span>
                    <select
                      value={unitNumber ?? ""}
                      onChange={(event) => setUnitNumber(event.target.value ? Number(event.target.value) : null)}
                      className="w-full max-w-md rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-[13px] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    >
                      <option value="">Select a unit</option>
                      {subject.units.map((unit) => (
                        <option key={unit.unitNumber} value={unit.unitNumber}>
                          Unit {unit.unitNumber}: {unit.title}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              )}
            </div>
          </Card>

          <Card
            title="Generation Configuration"
            description="Defaults come from AI Settings and the selected programme."
            actions={
              <button type="button" onClick={() => setShowAdvanced((value) => !value)} className={BUTTON_STYLES.ghost}>
                {showAdvanced ? "Hide" : "Show"} advanced
              </button>
            }
          >
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Choice label="Content Level" value={level} onChange={setLevel} options={AI_CONTENT_LEVELS} labels={AI_CONTENT_LEVEL_LABELS} />
              <Choice label="Language" value={language} onChange={setLanguage} options={AI_LANGUAGES} labels={AI_LANGUAGE_LABELS} />
              <Choice label="Content Length" value={length} onChange={setLength} options={AI_CONTENT_LENGTHS} labels={AI_CONTENT_LENGTH_LABELS} />
              <Choice label="Difficulty" value={difficulty} onChange={setDifficulty} options={AI_DIFFICULTIES} labels={AI_DIFFICULTY_LABELS} />
            </div>

            <div className="mt-4">
              <p className="mb-1.5 text-[12px] font-medium text-slate-600 dark:text-slate-300">
                Teaching Style <span className="font-normal text-slate-400">— several may apply</span>
              </p>
              <div className="flex flex-wrap gap-1.5">
                {AI_TEACHING_STYLES.map((style) => {
                  const active = styles.includes(style);
                  return (
                    <button
                      key={style}
                      type="button"
                      aria-pressed={active}
                      onClick={() =>
                        setStyles((current) =>
                          current.includes(style)
                            ? // Never allow an empty set: the prompt would have no
                              // style direction at all.
                              current.length > 1
                              ? current.filter((entry) => entry !== style)
                              : current
                            : [...current, style]
                        )
                      }
                      className={`rounded-md px-2 py-1 text-[12px] font-medium ring-1 ring-inset transition ${
                        active
                          ? "bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:ring-blue-500/30"
                          : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-700"
                      }`}
                    >
                      {AI_TEACHING_STYLE_LABELS[style]}
                    </button>
                  );
                })}
              </div>
            </div>

            {showAdvanced && (
              <div className="mt-4 border-t border-slate-100 pt-4 dark:border-slate-800">
                <label className="block">
                  <span className="mb-1 block text-[12px] font-medium text-slate-600 dark:text-slate-300">
                    Additional instructions
                  </span>
                  <textarea
                    value={instructions}
                    onChange={(event) => setInstructions(event.target.value)}
                    rows={3}
                    maxLength={4000}
                    placeholder="Anything specific for this generation. It is obeyed only where it does not conflict with the syllabus rules."
                    className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-[13px] placeholder:text-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  />
                </label>
              </div>
            )}
          </Card>

          {/* ── Submit and progress ─────────────────────────────────────── */}
          <Card>
            {!canGenerate ? (
              <p className="text-[13px] text-slate-500 dark:text-slate-400">
                You do not have the <code className="text-[12px]">ai_course_content.generate</code> permission.
              </p>
            ) : phase === "selecting" || phase === "error" ? (
              <div className="space-y-3">
                {message && (
                  <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[12.5px] text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200">
                    {message}
                  </p>
                )}

                {duplicate && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-500/30 dark:bg-amber-500/10">
                    <p className="text-[12.5px] font-medium text-amber-900 dark:text-amber-100">
                      Content already exists for this subject — {duplicate.status}, {duplicate.versionCount} version
                      {duplicate.versionCount === 1 ? "" : "s"}
                      {duplicate.coveredUnits.length ? `, covering units ${duplicate.coveredUnits.join(", ")}` : ""}.
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Link href={`/admin/ai/course-content/${duplicate.id}`} className={BUTTON_STYLES.secondary}>
                        Open existing
                      </Link>
                      <button type="button" onClick={() => submit("new-version")} className={BUTTON_STYLES.secondary}>
                        Create new version
                      </button>
                      {duplicate.status !== "published" && (
                        <button type="button" onClick={() => submit("replace-draft")} className={BUTTON_STYLES.secondary}>
                          Replace draft
                        </button>
                      )}
                    </div>
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => submit("reject")}
                    disabled={needsUnit && !unitNumber}
                    className={`${BUTTON_STYLES.primary} disabled:cursor-not-allowed disabled:opacity-50`}
                  >
                    Generate {meta?.label}
                  </button>
                  <p className="text-[12px] text-slate-500 dark:text-slate-400">
                    Generation is asynchronous — a job is created and you can leave this page.
                  </p>
                </div>
              </div>
            ) : phase === "done" && job ? (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="success">Generated</Badge>
                  <span className="text-[13px] text-slate-700 dark:text-slate-200">
                    Job {job.reference} finished — version {job.versionNumber} saved as a draft.
                  </span>
                </div>

                {job.usingMock && (
                  <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12.5px] text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
                    <strong className="font-semibold">This is placeholder text.</strong> The mock provider
                    produced it because no real provider is enabled. It cannot be published — enable Gemini in
                    AI Settings and regenerate.
                  </p>
                )}

                {job.warnings.length > 0 && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-500/30 dark:bg-amber-500/10">
                    <p className="text-[12px] font-semibold text-amber-900 dark:text-amber-100">
                      {job.warnings.length} thing{job.warnings.length === 1 ? "" : "s"} for a reviewer to check
                    </p>
                    <ul className="mt-1.5 space-y-1">
                      {job.warnings.map((warning, index) => (
                        <li key={index} className="text-[12px] text-amber-800 dark:text-amber-200">
                          {warning.message}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="flex flex-wrap gap-2">
                  {job.contentId && (
                    <Link href={`/admin/ai/course-content/${job.contentId}`} className={BUTTON_STYLES.primary}>
                      Review the content
                    </Link>
                  )}
                  <button type="button" onClick={reset} className={BUTTON_STYLES.secondary}>
                    Generate something else
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-blue-500" />
                  <span className="text-[13px] text-slate-700 dark:text-slate-200">
                    {phase === "submitting"
                      ? "Creating the generation job…"
                      : `Job ${job?.reference} is ${job?.status}…`}
                  </span>
                </div>
                <p className="text-[12px] text-slate-500 dark:text-slate-400">
                  {job ? `${job.provider} · ${job.model}. ` : ""}
                  You can leave this page — the job continues and appears in AI Generation Jobs.
                </p>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

function Choice({
  label,
  value,
  onChange,
  options,
  labels,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly string[];
  labels: Record<string, string>;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[12px] font-medium text-slate-600 dark:text-slate-300">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-[13px] text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {labels[option] ?? option}
          </option>
        ))}
      </select>
    </label>
  );
}
