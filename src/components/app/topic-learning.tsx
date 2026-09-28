"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  BookIcon,
  CheckCircleIcon,
  ClipboardIcon,
  FileTextIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ClockIcon,
  LightbulbIcon,
  RobotIcon,
} from "@/components/icons";
import { TutorPanel } from "@/components/app/tutor-panel";
import { APP_ROUTES } from "@/lib/app-routes";
import type { LearningEventType } from "@/lib/learning/fields";
import type { TopicView } from "@/lib/learning/topics";
import type { TopicMaterial } from "@/lib/teaching/student-view";

/**
 * The topic screen (§8, §37, §38).
 *
 * Three columns on a desktop — topic navigation, the learning content, the
 * tutor — collapsing to one on a phone in the order §38 prescribes: content,
 * then tutor, then previous questions. The majority of these students are on an
 * Android phone on a slow connection (§78), so the desktop layout is the
 * variant and the single column is the base.
 *
 * **Everything above the tutor panel is already here.** It arrived with the
 * page, from the database. The student reads the whole explanation, the
 * example, the key points and the self-check without a single request leaving
 * the browser — which is what §9 is for, and why the tutor can afford to exist
 * at all.
 *
 * Progress is reported as *events*, not percentages (§24). The client says
 * "the practical section was opened"; the server decides what that is worth.
 */
export function TopicLearning({
  topic,
  material,
}: {
  topic: TopicView;
  /**
   * The coursework attached to this topic, for §52's "Related learning
   * material". Optional so the component still renders on a page that has not
   * been updated to fetch it.
   */
  material?: TopicMaterial;
}) {
  const [openCheck, setOpenCheck] = useState<Set<number>>(new Set());
  const [progress, setProgress] = useState(topic.progress);

  const { report } = useLearningEvents(topic.id, setProgress);

  /**
   * Opening the page is recorded and is worth nothing (§24).
   *
   * `BASIC_VIEWED` fires alongside it because the basic explanation is above
   * the fold and already rendered — there is no honest way to claim the student
   * did not see it. The sections further down are reported when they are
   * actually opened.
   */
  useEffect(() => {
    report("TOPIC_OPENED");
    if (topic.content?.basicExplanation) report("BASIC_VIEWED");
  }, [report, topic.content?.basicExplanation]);

  useHeartbeat(report);

  const content = topic.content;
  const percentage = progress?.progressPercentage ?? 0;

  return (
    <div className="mx-auto max-w-[1400px]">
      <Breadcrumb topic={topic} />

      <div className="mt-5 grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)] xl:grid-cols-[220px_minmax(0,1fr)_380px]">
        <TopicRail topic={topic} />

        <main className="min-w-0">
          <Header topic={topic} percentage={percentage} />

          {content ? (
            <>
              <Section
                id="basic"
                title="Basic explanation"
                blurb="Written for this topic in your syllabus. No AI request needed."
              >
                <Prose text={content.basicExplanation} />

                {content.whyItMatters && (
                  <Callout icon={<LightbulbIcon className="h-4 w-4" />} title="Why it matters">
                    {content.whyItMatters}
                  </Callout>
                )}

                {content.realWorldAnalogy && (
                  <Callout title="An everyday comparison">{content.realWorldAnalogy}</Callout>
                )}

                {content.terminology.length > 0 && (
                  <dl className="mt-4 grid gap-2 sm:grid-cols-2">
                    {content.terminology.map((entry) => (
                      <div
                        key={entry.term}
                        className="rounded-xl border border-slate-200/80 bg-slate-50/60 p-3 dark:border-slate-800 dark:bg-slate-800/40"
                      >
                        <dt className="text-[13px] font-semibold text-slate-900 dark:text-white">
                          {entry.term}
                        </dt>
                        <dd className="mt-0.5 text-[13px] leading-relaxed text-slate-600 dark:text-slate-300">
                          {entry.meaning}
                        </dd>
                      </div>
                    ))}
                  </dl>
                )}
              </Section>

              {(content.practicalExplanation ||
                content.realWorldExamples.length > 0 ||
                content.codeExample) && (
                <Collapsible
                  title="Practical example"
                  blurb="Where this is used, and a worked example."
                  onOpen={() => report("PRACTICAL_VIEWED")}
                  defaultOpen
                >
                  <Prose text={content.practicalExplanation} />

                  {content.realWorldExamples.length > 0 && (
                    <ul className="mt-3 space-y-1.5">
                      {content.realWorldExamples.map((example) => (
                        <li
                          key={example}
                          className="flex gap-2 text-[14px] leading-relaxed text-slate-600 dark:text-slate-300"
                        >
                          <span aria-hidden="true" className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" />
                          {example}
                        </li>
                      ))}
                    </ul>
                  )}

                  {content.codeExample && (
                    <figure className="mt-4 overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800">
                      {content.codeExample.language && (
                        <figcaption className="border-b border-slate-200 bg-slate-50 px-3 py-1.5 font-mono text-[11.5px] uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-400">
                          {content.codeExample.language}
                        </figcaption>
                      )}
                      <pre className="overflow-x-auto bg-slate-900 p-4 text-[12.5px] leading-relaxed text-slate-100">
                        <code>{content.codeExample.code}</code>
                      </pre>
                      {content.codeExample.output && (
                        <div className="border-t border-slate-200 bg-slate-50 px-4 py-2.5 dark:border-slate-800 dark:bg-slate-800/60">
                          <p className="text-[11.5px] font-semibold uppercase tracking-wide text-slate-400">
                            Output
                          </p>
                          <pre className="mt-1 overflow-x-auto font-mono text-[12.5px] text-slate-700 dark:text-slate-200">
                            {content.codeExample.output}
                          </pre>
                        </div>
                      )}
                      {content.codeExample.explanation && (
                        <div className="border-t border-slate-200 px-4 py-3 text-[13.5px] leading-relaxed text-slate-600 dark:border-slate-800 dark:text-slate-300">
                          {content.codeExample.explanation}
                        </div>
                      )}
                    </figure>
                  )}
                </Collapsible>
              )}

              {content.keyPoints.length > 0 && (
                <Section id="key-points" title="Key points">
                  <ul className="space-y-2">
                    {content.keyPoints.map((point, index) => (
                      <li key={point} className="flex gap-3 text-[14px] leading-relaxed text-slate-700 dark:text-slate-200">
                        <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-blue-50 text-[11px] font-bold text-blue-700 dark:bg-blue-500/10 dark:text-blue-300">
                          {index + 1}
                        </span>
                        {point}
                      </li>
                    ))}
                  </ul>
                </Section>
              )}

              {content.commonMistakes.length > 0 && (
                <Section id="mistakes" title="Common mistakes">
                  <ul className="space-y-2">
                    {content.commonMistakes.map((mistake) => (
                      <li
                        key={mistake}
                        className="rounded-xl border border-amber-200/70 bg-amber-50/60 px-3.5 py-2.5 text-[13.5px] leading-relaxed text-amber-900 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200"
                      >
                        {mistake}
                      </li>
                    ))}
                  </ul>
                </Section>
              )}

              {content.checkYourUnderstanding.length > 0 && (
                <Section
                  id="check"
                  title="Check your understanding"
                  blurb="Answers are stored with the question — revealing one costs nothing."
                >
                  <ol className="space-y-2.5">
                    {content.checkYourUnderstanding.map((item, index) => {
                      const shown = openCheck.has(index);
                      return (
                        <li
                          key={item.question}
                          className="rounded-xl border border-slate-200/80 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
                        >
                          <p className="text-[14px] font-medium text-slate-900 dark:text-white">
                            {index + 1}. {item.question}
                          </p>

                          {item.hint && !shown && (
                            <p className="mt-1.5 text-[12.5px] text-slate-400 dark:text-slate-500">
                              Hint: {item.hint}
                            </p>
                          )}

                          {shown ? (
                            <p className="mt-2.5 rounded-lg bg-emerald-50/70 px-3 py-2 text-[13.5px] leading-relaxed text-emerald-900 dark:bg-emerald-500/10 dark:text-emerald-200">
                              {item.answer}
                            </p>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                setOpenCheck((current) => new Set(current).add(index));
                                report("CHECK_ATTEMPTED", { question: index + 1 });
                              }}
                              className="mt-2.5 rounded-lg border border-slate-200 px-3 py-1.5 text-[13px] font-semibold text-slate-600 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                            >
                              Show the answer
                            </button>
                          )}
                        </li>
                      );
                    })}
                  </ol>
                </Section>
              )}

              <ProvenanceNote content={content} />
            </>
          ) : (
            <NoContentYet topic={topic} />
          )}

          {material && <RelatedMaterial material={material} subjectId={topic.subject.id} />}

          <SyllabusNote topic={topic} />

          <TopicFooterNav topic={topic} progress={progress} onComplete={() => report("TOPIC_COMPLETED")} />
        </main>

        <TutorPanel
          topicId={topic.id}
          topicTitle={topic.title}
          subjectName={topic.subject.name}
          subtopics={topic.subtopics}
          previousQuestions={topic.previousQuestions}
          conversations={topic.conversations}
          hasPreparedContent={Boolean(content)}
          onDeeperRequested={() => report("ADVANCED_REQUESTED")}
        />
      </div>
    </div>
  );
}

// ── Events ────────────────────────────────────────────────────────────────

/**
 * Report a learning event, and keep the local progress in step with the
 * server's answer.
 *
 * The response is the authority. The client never computes a percentage — it
 * renders the one the server returned, so the bar and the database cannot
 * disagree (§24).
 *
 * Failures are swallowed. A student on a train losing an analytics beacon must
 * not see an error about it; the next event re-establishes the truth, because
 * the signals are idempotent flags rather than increments.
 */
function useLearningEvents(
  topicId: string,
  setProgress: (progress: TopicView["progress"]) => void
) {
  const inFlight = useRef(new Set<string>());

  const report = useCallback(
    async (type: LearningEventType, meta?: Record<string, unknown>, timeSpentSeconds?: number) => {
      // One in-flight call per event type. Two renders firing BASIC_VIEWED at
      // once would otherwise be two identical writes.
      const key = `${type}:${JSON.stringify(meta ?? {})}`;
      if (inFlight.current.has(key)) return;
      inFlight.current.add(key);

      try {
        const response = await fetch("/api/learning/events", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ topicId, type, meta, timeSpentSeconds }),
        });

        if (!response.ok) return;
        const payload = (await response.json()) as { data?: { progress?: TopicView["progress"] } };
        if (payload.data?.progress) setProgress(payload.data.progress);
      } catch {
        // Analytics must never surface as an error to the student.
      } finally {
        inFlight.current.delete(key);
      }
    },
    [topicId, setProgress]
  );

  return { report };
}

/**
 * Time on the topic, sent every ninety seconds while the tab is visible.
 *
 * Visibility-gated, because a tab left open overnight is not ninety minutes of
 * study and "average learning time" would be meaningless if it were counted.
 * The server clamps each increment regardless — this is the honest client, not
 * the enforcement.
 */
function useHeartbeat(report: (type: LearningEventType, meta?: Record<string, unknown>, seconds?: number) => void) {
  useEffect(() => {
    const INTERVAL_SECONDS = 90;

    const timer = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      report("TOPIC_OPENED", { heartbeat: true }, INTERVAL_SECONDS);
    }, INTERVAL_SECONDS * 1000);

    return () => clearInterval(timer);
  }, [report]);
}

// ── Pieces ────────────────────────────────────────────────────────────────

function Breadcrumb({ topic }: { topic: TopicView }) {
  return (
    <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1.5 text-[13px] text-slate-400">
      <Link href={APP_ROUTES.curriculum} className="transition hover:text-slate-600 dark:hover:text-slate-300">
        Curriculum
      </Link>
      <ChevronRightIcon className="h-3.5 w-3.5" />
      <Link
        href={`${APP_ROUTES.curriculum}/${topic.subject.id}`}
        className="transition hover:text-slate-600 dark:hover:text-slate-300"
      >
        {topic.subject.code}
      </Link>
      <ChevronRightIcon className="h-3.5 w-3.5" />
      <span className="truncate text-slate-500 dark:text-slate-400">{topic.title}</span>
    </nav>
  );
}

function Header({ topic, percentage }: { topic: TopicView; percentage: number }) {
  return (
    <header className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-[0_1px_3px_rgba(15,23,42,0.04)] dark:border-slate-800 dark:bg-slate-900">
      <p className="text-[12.5px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
        {topic.subject.name}
        {topic.unitNumber !== null && ` · Unit ${topic.unitNumber}`}
      </p>
      <h1 className="mt-1 text-[25px] font-bold leading-tight tracking-tight text-slate-900 dark:text-white">
        {topic.title}
      </h1>

      {topic.description && (
        <p className="mt-2 text-[14.5px] leading-relaxed text-slate-600 dark:text-slate-300">
          {topic.description}
        </p>
      )}

      <div className="mt-3.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[13px] text-slate-500 dark:text-slate-400">
        <span className="capitalize">{topic.difficulty}</span>
        <span>Topic {topic.sequence}</span>
        {topic.estimatedMinutes && (
          <span className="inline-flex items-center gap-1.5">
            <ClockIcon className="h-3.5 w-3.5" />
            about {topic.estimatedMinutes} min
          </span>
        )}
        {topic.subtopics.length > 0 && <span>{topic.subtopics.length} subtopics</span>}
      </div>

      <div className="mt-4">
        <div className="flex items-baseline justify-between text-[12.5px]">
          <span className="font-semibold text-slate-600 dark:text-slate-300">Your progress</span>
          <span className="text-slate-400 dark:text-slate-500">{percentage}%</span>
        </div>
        <div
          role="progressbar"
          aria-valuenow={percentage}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${topic.title} progress`}
          className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"
        >
          <div
            className="h-full rounded-full bg-blue-600 transition-[width] duration-500"
            style={{ width: `${percentage}%` }}
          />
        </div>
      </div>
    </header>
  );
}

/** The left rail: every topic in the subject, this one highlighted (§38). */
function TopicRail({ topic }: { topic: TopicView }) {
  return (
    <nav aria-label="Topics in this subject" className="hidden lg:block">
      <div className="sticky top-6 max-h-[calc(100vh-3rem)] overflow-y-auto pr-1">
        <p className="px-2 pb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
          Topics
        </p>
        <ol className="space-y-0.5">
          {topic.siblings.map((sibling) => {
            const active = sibling.id === topic.id;
            return (
              <li key={sibling.id}>
                <Link
                  href={`${APP_ROUTES.curriculum}/${topic.subject.id}/topics/${sibling.id}`}
                  aria-current={active ? "page" : undefined}
                  className={`flex items-start gap-2 rounded-lg px-2.5 py-1.5 text-[13px] leading-snug transition outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 ${
                    active
                      ? "bg-blue-50 font-semibold text-blue-800 dark:bg-blue-500/10 dark:text-blue-200"
                      : "text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                  }`}
                >
                  <span className="mt-[3px] w-4 shrink-0 text-right text-[11px] tabular-nums text-slate-400">
                    {sibling.sequence}
                  </span>
                  <span className="min-w-0 flex-1">{sibling.title}</span>
                  {sibling.status === "completed" && (
                    <CheckCircleIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
                  )}
                </Link>
              </li>
            );
          })}
        </ol>
      </div>
    </nav>
  );
}

function Section({
  id,
  title,
  blurb,
  children,
}: {
  id: string;
  title: string;
  blurb?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      className="mt-5 rounded-2xl border border-slate-200/80 bg-white p-6 dark:border-slate-800 dark:bg-slate-900"
    >
      <h2 className="text-[16px] font-semibold text-slate-900 dark:text-white">{title}</h2>
      {blurb && <p className="mt-0.5 text-[12.5px] text-slate-400 dark:text-slate-500">{blurb}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Collapsible({
  title,
  blurb,
  children,
  onOpen,
  defaultOpen = false,
}: {
  title: string;
  blurb?: string;
  children: React.ReactNode;
  onOpen: () => void;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const reported = useRef(false);

  // Fires once, on the first open — including when it starts open, since the
  // content is then genuinely on screen.
  useEffect(() => {
    if (open && !reported.current) {
      reported.current = true;
      onOpen();
    }
  }, [open, onOpen]);

  return (
    <section className="mt-5 rounded-2xl border border-slate-200/80 bg-white dark:border-slate-800 dark:bg-slate-900">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 rounded-2xl p-6 text-left outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
      >
        <span>
          <span className="block text-[16px] font-semibold text-slate-900 dark:text-white">
            {title}
          </span>
          {blurb && (
            <span className="mt-0.5 block text-[12.5px] text-slate-400 dark:text-slate-500">
              {blurb}
            </span>
          )}
        </span>
        <ChevronDownIcon
          className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && <div className="px-6 pb-6">{children}</div>}
    </section>
  );
}

/**
 * Render stored prose.
 *
 * Paragraph splitting and a light pass over `**bold**` and `` `code` ``, not a
 * Markdown library and never `dangerouslySetInnerHTML`. The content is
 * generated text: rendering it as HTML would make a model's output a script
 * injection surface, and pulling in a sanitiser plus a parser is a large
 * dependency for the four constructs that actually appear.
 */
function Prose({ text }: { text: string | null }) {
  if (!text) return null;

  return (
    <div className="space-y-3">
      {text.split(/\n{2,}/).map((paragraph, index) => {
        const trimmed = paragraph.trim();
        if (!trimmed) return null;

        if (/^#{1,4}\s/.test(trimmed)) {
          return (
            <h3
              key={index}
              className="pt-1 text-[15px] font-semibold text-slate-900 dark:text-white"
            >
              {trimmed.replace(/^#{1,4}\s/, "")}
            </h3>
          );
        }

        if (/^[-*]\s/m.test(trimmed)) {
          return (
            <ul key={index} className="space-y-1.5">
              {trimmed.split("\n").map((line, lineIndex) => (
                <li
                  key={lineIndex}
                  className="flex gap-2 text-[14px] leading-relaxed text-slate-700 dark:text-slate-200"
                >
                  <span aria-hidden="true" className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-slate-300 dark:bg-slate-600" />
                  <span>{inline(line.replace(/^[-*]\s/, ""))}</span>
                </li>
              ))}
            </ul>
          );
        }

        return (
          <p key={index} className="text-[14.5px] leading-relaxed text-slate-700 dark:text-slate-200">
            {inline(trimmed)}
          </p>
        );
      })}
    </div>
  );
}

/** `**bold**` and `` `code` `` as React nodes — no HTML string anywhere. */
function inline(text: string): React.ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={index} className="font-semibold text-slate-900 dark:text-white">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
      return (
        <code
          key={index}
          className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[0.9em] text-slate-800 dark:bg-slate-800 dark:text-slate-200"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    return <span key={index}>{part}</span>;
  });
}

function Callout({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-4 rounded-xl border border-blue-200/70 bg-blue-50/60 p-4 dark:border-blue-500/20 dark:bg-blue-500/10">
      <p className="flex items-center gap-2 text-[13px] font-semibold text-blue-900 dark:text-blue-200">
        {icon}
        {title}
      </p>
      <p className="mt-1 text-[13.5px] leading-relaxed text-blue-900/90 dark:text-blue-100/90">
        {children}
      </p>
    </div>
  );
}

/**
 * Assignments and notes for this topic (§52).
 *
 * This is the payoff of §51: the explanation, the work set on it, the material
 * shared for it and the AI tutor are all on one screen, reachable from each
 * other. A student stuck on an assignment is one tap from the topic that
 * explains it, and vice versa.
 *
 * Rendered only when there is something to show — an empty "Related learning
 * material" heading on every topic in the syllabus would be a permanent
 * reminder of what the platform does not have.
 */
function RelatedMaterial({
  material,
  subjectId,
}: {
  material: TopicMaterial;
  subjectId: string;
}) {
  void subjectId;

  if (material.assignments.length === 0 && material.notes.length === 0) return null;

  return (
    <section className="mt-5 rounded-2xl border border-slate-200/80 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
      <h2 className="text-[16px] font-semibold text-slate-900 dark:text-white">
        Related learning material
      </h2>
      <p className="mt-0.5 text-[12.5px] text-slate-400 dark:text-slate-500">
        Set and shared by your teachers for this topic.
      </p>

      {material.assignments.length > 0 && (
        <div className="mt-3.5">
          <h3 className="text-[11.5px] font-semibold uppercase tracking-wide text-slate-400">
            Assignments
          </h3>
          <ul className="mt-1.5 space-y-1.5">
            {material.assignments.map((assignment) => (
              <li key={assignment.id}>
                <Link
                  href={`${APP_ROUTES.assignments}/${assignment.id}`}
                  className="flex items-center gap-2.5 rounded-lg border border-slate-200/70 px-3 py-2 text-[13.5px] transition hover:border-blue-300 dark:border-slate-800"
                >
                  <ClipboardIcon className="h-4 w-4 shrink-0 text-slate-400" />
                  <span className="min-w-0 flex-1 truncate text-slate-800 dark:text-slate-100">
                    {assignment.title}
                  </span>
                  {assignment.dueAt && (
                    <span className="shrink-0 text-[12px] text-slate-400">
                      due {new Date(assignment.dueAt).toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "short",
                      })}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {material.notes.length > 0 && (
        <div className="mt-3.5">
          <h3 className="text-[11.5px] font-semibold uppercase tracking-wide text-slate-400">
            Notes
          </h3>
          <ul className="mt-1.5 space-y-1.5">
            {material.notes.map((note) => (
              <li key={note.id}>
                <Link
                  href={`${APP_ROUTES.notes}/${note.id}`}
                  className="flex items-center gap-2.5 rounded-lg border border-slate-200/70 px-3 py-2 text-[13.5px] transition hover:border-blue-300 dark:border-slate-800"
                >
                  <FileTextIcon className="h-4 w-4 shrink-0 text-slate-400" />
                  <span className="min-w-0 flex-1 truncate text-slate-800 dark:text-slate-100">
                    {note.title}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

/**
 * The syllabus, quoted as the syllabus (§54).
 *
 * Kept visually distinct from everything above it, because the difference
 * between "this is what your regulation prescribes" and "this is our
 * explanation of it" is the single distinction §54 exists to protect.
 */
function SyllabusNote({ topic }: { topic: TopicView }) {
  if (!topic.unitSyllabusTopics.length && !topic.unitTitle) return null;

  return (
    <section className="mt-5 rounded-2xl border border-slate-200/80 bg-slate-50/70 p-6 dark:border-slate-800 dark:bg-slate-800/30">
      <h2 className="flex items-center gap-2 text-[15px] font-semibold text-slate-900 dark:text-white">
        <BookIcon className="h-4 w-4 text-slate-400" />
        From your syllabus
      </h2>
      <p className="mt-0.5 text-[12.5px] text-slate-400 dark:text-slate-500">
        Your college&apos;s official curriculum, quoted. Not generated.
      </p>

      {topic.unitTitle && (
        <p className="mt-3 text-[14px] font-medium text-slate-800 dark:text-slate-100">
          Unit {topic.unitNumber}: {topic.unitTitle}
        </p>
      )}

      {topic.unitSyllabusTopics.length > 0 && (
        <p className="mt-1.5 text-[13.5px] leading-relaxed text-slate-600 dark:text-slate-300">
          {topic.unitSyllabusTopics.join(" · ")}
        </p>
      )}
    </section>
  );
}

/** §36: the student is told what they are reading, every time. */
function ProvenanceNote({ content }: { content: NonNullable<TopicView["content"]> }) {
  return (
    <p className="mt-4 px-1 text-[12px] leading-relaxed text-slate-400 dark:text-slate-500">
      {content.origin === "authored"
        ? "Written by EduPilot's content team for this syllabus."
        : "AI-generated study material, prepared for this syllabus and reviewed before publishing."}{" "}
      It is study support, not your university&apos;s official notes — the syllabus itself is quoted
      separately below.
    </p>
  );
}

function NoContentYet({ topic }: { topic: TopicView }) {
  return (
    <section className="mt-5 rounded-2xl border border-slate-200/80 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
      <span className="grid h-11 w-11 place-items-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400">
        <RobotIcon className="h-5 w-5" />
      </span>
      <h2 className="mt-3.5 text-[16px] font-semibold text-slate-900 dark:text-white">
        No prepared explanation yet
      </h2>
      <p className="mt-1.5 max-w-lg text-[14px] leading-relaxed text-slate-500 dark:text-slate-400">
        Nobody has published a written explanation for {topic.title} yet. Your syllabus for it is
        below, and the AI tutor can explain it now — it already has your subject, your regulation
        and this unit&apos;s syllabus as context.
      </p>
    </section>
  );
}

function TopicFooterNav({
  topic,
  progress,
  onComplete,
}: {
  topic: TopicView;
  progress: TopicView["progress"];
  onComplete: () => void;
}) {
  const [completing, setCompleting] = useState(false);
  const complete = progress?.status === "completed";

  async function markComplete() {
    setCompleting(true);
    try {
      await fetch("/api/learning/progress", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topicId: topic.id, completed: true }),
      });
      onComplete();
    } finally {
      setCompleting(false);
    }
  }

  return (
    <nav className="mt-6 flex flex-col gap-3 border-t border-slate-200 pt-5 sm:flex-row sm:items-center sm:justify-between dark:border-slate-800">
      <div className="flex gap-2">
        {topic.previous && (
          <Link
            href={`${APP_ROUTES.curriculum}/${topic.subject.id}/topics/${topic.previous.id}`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-[13.5px] font-medium text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <ChevronLeftIcon className="h-3.5 w-3.5" />
            <span className="max-w-[10rem] truncate">{topic.previous.title}</span>
          </Link>
        )}
        {topic.next && (
          <Link
            href={`${APP_ROUTES.curriculum}/${topic.subject.id}/topics/${topic.next.id}`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-[13.5px] font-medium text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <span className="max-w-[10rem] truncate">{topic.next.title}</span>
            <ChevronRightIcon className="h-3.5 w-3.5" />
          </Link>
        )}
      </div>

      {complete ? (
        <p className="inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-emerald-600 dark:text-emerald-400">
          <CheckCircleIcon className="h-4 w-4" />
          Completed
        </p>
      ) : (
        <button
          type="button"
          onClick={markComplete}
          disabled={completing}
          className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-[13.5px] font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-500/25"
        >
          <CheckCircleIcon className="h-4 w-4" />
          {completing ? "Saving..." : "Mark as complete"}
        </button>
      )}
    </nav>
  );
}
