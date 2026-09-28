"use client";

import { useEffect, useRef, useState } from "react";
import { BoltIcon, ChatIcon, RobotIcon, SendIcon } from "@/components/icons";
import {
  DEPTH_LEVEL_BLURBS,
  DEPTH_LEVEL_LABELS,
  FOLLOW_UPS,
  REQUESTABLE_DEPTH_LEVELS,
  type DepthLevel,
} from "@/lib/learning/fields";
import type { TutorAnswer } from "@/lib/tutor/schema";
import type { PreviousQuestion, TopicConversationSummary } from "@/lib/learning/topics";

/**
 * The AI tutor panel (§8, §39).
 *
 * Deliberately not a chat box with a send button (§39). A student who has just
 * read an explanation does not know what to type; they know they want it
 * simpler, or with code, or with an example. The quick actions are the primary
 * interface and the text field is the escape hatch — and because the actions
 * send a *key* rather than a sentence, the eight most common questions in the
 * platform all normalise to the same cache entries (§17).
 *
 * Three things this component never does:
 *
 *   - **Name a model.** §39: which provider answered is not information a
 *     student can act on, and showing it invites trust in one over another on
 *     no basis. The API returns it; this panel ignores it.
 *   - **Call a model to show an old answer.** "View" renders what is already
 *     in `previousQuestions`, or fetches the stored row. Only "Ask again"
 *     spends a request (§15).
 *   - **Parse the stream as JSON.** The raw text is shown while it arrives and
 *     replaced by the structured render on `done`, which carries the answer the
 *     server actually validated and stored.
 */

type Turn = {
  /** Local render key. Not the interaction id — one exists only once stored. */
  id: string;
  /**
   * The stored interaction, once the server has written it.
   *
   * Kept separately from `id` because "Regenerate" needs the *database* id and
   * a turn has none until `done` arrives — reusing the render key would post a
   * retry against an id that never existed.
   */
  interactionId: string | null;
  question: string;
  answer: TutorAnswer | null;
  /** Text as it arrives, before the server confirms the stored answer. */
  streaming: string | null;
  error: string | null;
  depthLevel: string;
};

export function TutorPanel({
  topicId,
  topicTitle,
  subjectName,
  subtopics,
  previousQuestions,
  conversations,
  hasPreparedContent,
  onDeeperRequested,
}: {
  topicId: string;
  topicTitle: string;
  subjectName: string;
  subtopics: { id: string; title: string }[];
  previousQuestions: PreviousQuestion[];
  conversations: TopicConversationSummary[];
  hasPreparedContent: boolean;
  onDeeperRequested: () => void;
}) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [question, setQuestion] = useState("");
  const [depth, setDepth] = useState<DepthLevel>("basic");
  const [subtopicId, setSubtopicId] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(
    conversations[0]?.id ?? null
  );
  const [history, setHistory] = useState(previousQuestions);

  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns]);

  /**
   * One request path for everything: free text, a quick action and "Go deeper"
   * differ only in what they put in the body.
   *
   * The endpoint decides the depth for a quick action (the action carries its
   * own), so the panel does not have to keep two ideas of the current level in
   * step with each other.
   */
  async function send(options: {
    endpoint: "question" | "deep-dive";
    question?: string;
    followUpAction?: string;
    forceDepth?: DepthLevel;
  }) {
    if (busy) return;
    setBusy(true);

    const shown =
      options.question ??
      (options.followUpAction
        ? FOLLOW_UPS.find((entry) => entry.key === options.followUpAction)?.label ?? "..."
        : `Explain ${topicTitle} in more depth`);

    const turnId = `turn-${Date.now()}`;
    setTurns((current) => [
      ...current,
      {
        id: turnId,
        interactionId: null,
        question: shown,
        answer: null,
        streaming: "",
        error: null,
        depthLevel: depth,
      },
    ]);

    try {
      const response = await fetch(`/api/ai/${options.endpoint === "question" ? "question" : "topic/deep-dive"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topicId,
          subtopicId: subtopicId || null,
          conversationId,
          question: options.question,
          followUpAction: options.followUpAction,
          depthLevel: options.forceDepth ?? depth,
          currentLevel: depth,
          stream: true,
        }),
      });

      if (!response.ok || !response.body) {
        /**
         * A non-2xx here is a refusal the server worded for a student — a quota,
         * a budget ceiling, an unknown topic. It is shown as-is, because the
         * alternative is a generic message that hides the one piece of
         * information they need (§51 forbids the *internals*, not the reason).
         */
        const payload = (await response.json().catch(() => null)) as
          | { error?: { message?: string } }
          | null;

        updateTurn(setTurns, turnId, {
          streaming: null,
          error: payload?.error?.message ?? "The AI tutor is temporarily unavailable.",
        });
        return;
      }

      await consumeStream(response.body, {
        onDelta: (text) =>
          setTurns((current) =>
            current.map((turn) =>
              turn.id === turnId ? { ...turn, streaming: (turn.streaming ?? "") + text } : turn
            )
          ),
        onDone: (interaction) => {
          updateTurn(setTurns, turnId, {
            interactionId: interaction.id,
            answer: interaction.answer,
            streaming: null,
            depthLevel: interaction.depthLevel,
          });
          setConversationId(interaction.conversationId);
          setDepth(interaction.depthLevel as DepthLevel);
          setHistory((current) => [
            {
              id: interaction.id,
              conversationId: interaction.conversationId,
              question: interaction.question,
              summary: interaction.answer?.summary ?? "",
              depthLevel: interaction.depthLevel,
              cacheHit: interaction.cacheHit,
              createdAt: interaction.createdAt,
            },
            ...current,
          ]);
        },
        onError: (message) => updateTurn(setTurns, turnId, { streaming: null, error: message }),
      });
    } catch {
      updateTurn(setTurns, turnId, {
        streaming: null,
        error: "The connection dropped before the answer arrived. Try again.",
      });
    } finally {
      setBusy(false);
    }
  }

  /** §15: viewing costs nothing. The stored answer is fetched, not regenerated. */
  async function view(interactionId: string) {
    const response = await fetch(`/api/ai/question/${interactionId}`);
    if (!response.ok) return;

    const payload = (await response.json()) as {
      data?: { interaction?: { question: string; answer: TutorAnswer | null; depthLevel: string } };
    };
    const stored = payload.data?.interaction;
    if (!stored) return;

    setTurns((current) => [
      ...current,
      {
        id: `view-${interactionId}-${Date.now()}`,
        interactionId,
        question: stored.question,
        answer: stored.answer,
        streaming: null,
        error: null,
        depthLevel: stored.depthLevel,
      },
    ]);
  }

  /** §15: this one does spend a request, and the button says so. */
  async function askAgain(interactionId: string) {
    if (busy) return;
    setBusy(true);

    const turnId = `retry-${Date.now()}`;
    setTurns((current) => [
      ...current,
      {
        id: turnId,
        interactionId: null,
        question: "Asking again...",
        answer: null,
        streaming: "",
        error: null,
        depthLevel: depth,
      },
    ]);

    try {
      const response = await fetch(`/api/ai/question/${interactionId}/retry`, { method: "POST" });
      const payload = (await response.json().catch(() => null)) as {
        data?: {
          interaction?: {
            id: string;
            question: string;
            answer: TutorAnswer;
            depthLevel: string;
            conversationId: string;
          };
        };
        error?: { message?: string };
      } | null;

      if (!response.ok || !payload?.data?.interaction) {
        updateTurn(setTurns, turnId, {
          streaming: null,
          error: payload?.error?.message ?? "The AI tutor is temporarily unavailable.",
        });
        return;
      }

      const stored = payload.data.interaction;
      updateTurn(setTurns, turnId, {
        interactionId: stored.id,
        question: stored.question,
        answer: stored.answer,
        streaming: null,
        depthLevel: stored.depthLevel,
      });
      setConversationId(stored.conversationId);
    } finally {
      setBusy(false);
    }
  }

  return (
    <aside
      aria-label="AI tutor"
      className="min-w-0 xl:sticky xl:top-6 xl:max-h-[calc(100vh-3rem)] xl:overflow-y-auto"
    >
      <div className="rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.04)] dark:border-slate-800 dark:bg-slate-900">
        <header className="border-b border-slate-100 p-4 dark:border-slate-800">
          <p className="flex items-center gap-2 text-[15px] font-semibold text-slate-900 dark:text-white">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-blue-600 text-white">
              <RobotIcon className="h-4 w-4" />
            </span>
            AI Tutor
          </p>
          <p className="mt-1 text-[12px] leading-relaxed text-slate-400 dark:text-slate-500">
            Grounded on {subjectName} — {topicTitle}. Study support, not official notes.
          </p>
        </header>

        <div className="border-b border-slate-100 p-4 dark:border-slate-800">
          <label
            htmlFor="tutor-depth"
            className="text-[11px] font-semibold uppercase tracking-wide text-slate-400"
          >
            Depth
          </label>
          <select
            id="tutor-depth"
            value={depth}
            onChange={(event) => setDepth(event.target.value as DepthLevel)}
            className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-[13.5px] text-slate-700 outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            {REQUESTABLE_DEPTH_LEVELS.map((level) => (
              <option key={level} value={level}>
                {DEPTH_LEVEL_LABELS[level]}
              </option>
            ))}
          </select>
          <p className="mt-1 text-[11.5px] leading-relaxed text-slate-400 dark:text-slate-500">
            {DEPTH_LEVEL_BLURBS[depth]}
          </p>

          {subtopics.length > 0 && (
            <>
              <label
                htmlFor="tutor-subtopic"
                className="mt-3 block text-[11px] font-semibold uppercase tracking-wide text-slate-400"
              >
                Focus on
              </label>
              <select
                id="tutor-subtopic"
                value={subtopicId}
                onChange={(event) => setSubtopicId(event.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-[13.5px] text-slate-700 outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                <option value="">The whole topic</option>
                {subtopics.map((subtopic) => (
                  <option key={subtopic.id} value={subtopic.id}>
                    {subtopic.title}
                  </option>
                ))}
              </select>
            </>
          )}

          <button
            type="button"
            disabled={busy}
            onClick={() => {
              onDeeperRequested();
              void send({ endpoint: "deep-dive" });
            }}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 py-2.5 text-[13.5px] font-semibold text-white transition hover:bg-blue-700 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-500/25"
          >
            <BoltIcon className="h-4 w-4" />
            {hasPreparedContent ? "Explain in more depth" : "Explain this topic"}
          </button>
        </div>

        <div className="max-h-[440px] overflow-y-auto p-4">
          {turns.length === 0 ? (
            <EmptyState hasPreparedContent={hasPreparedContent} />
          ) : (
            <ol className="space-y-4">
              {turns.map((turn) => (
                <li key={turn.id}>
                  <TurnView turn={turn} onAskAgain={askAgain} busy={busy} />
                </li>
              ))}
            </ol>
          )}
          <div ref={endRef} />
        </div>

        <div className="border-t border-slate-100 p-4 dark:border-slate-800">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            Quick actions
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {FOLLOW_UPS.map((action) => (
              <button
                key={action.key}
                type="button"
                disabled={busy}
                onClick={() => void send({ endpoint: "question", followUpAction: action.key })}
                className="rounded-full border border-slate-200 px-2.5 py-1 text-[12px] font-medium text-slate-600 transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-blue-500/10 dark:hover:text-blue-300"
              >
                {action.label}
              </button>
            ))}
          </div>

          <form
            onSubmit={(event) => {
              event.preventDefault();
              const trimmed = question.trim();
              if (!trimmed) return;
              setQuestion("");
              void send({ endpoint: "question", question: trimmed });
            }}
            className="mt-3 flex items-end gap-2"
          >
            <label htmlFor="tutor-question" className="sr-only">
              Ask anything about {topicTitle}
            </label>
            <textarea
              id="tutor-question"
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              onKeyDown={(event) => {
                // Enter sends, Shift+Enter breaks the line. A textarea rather
                // than an input because questions genuinely run to three lines.
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
              rows={2}
              maxLength={2000}
              placeholder={`Ask anything about ${topicTitle}...`}
              className="min-h-[44px] flex-1 resize-none rounded-lg border border-slate-200 px-3 py-2 text-[13.5px] text-slate-700 outline-none placeholder:text-slate-400 focus-visible:ring-2 focus-visible:ring-blue-500/40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            />
            <button
              type="submit"
              disabled={busy || !question.trim()}
              aria-label="Send question"
              className="grid h-[44px] w-[44px] shrink-0 place-items-center rounded-lg bg-blue-600 text-white transition hover:bg-blue-700 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-500/25"
            >
              <SendIcon className="h-4 w-4" />
            </button>
          </form>
        </div>
      </div>

      {history.length > 0 && (
        <PreviousQuestions
          history={history}
          busy={busy}
          onView={view}
          onAskAgain={askAgain}
        />
      )}
    </aside>
  );
}

// ── Stream handling ───────────────────────────────────────────────────────

type DoneInteraction = {
  id: string;
  conversationId: string;
  question: string;
  answer: TutorAnswer;
  depthLevel: string;
  cacheHit: boolean;
  createdAt: string;
};

/**
 * Read the NDJSON stream, one event per line.
 *
 * The buffer is carried across chunks because a network chunk boundary lands
 * mid-line often enough that parsing per chunk works in development and fails
 * in production. The last, possibly-incomplete line is left in the buffer for
 * the next read.
 */
async function consumeStream(
  body: ReadableStream<Uint8Array>,
  handlers: {
    onDelta: (text: string) => void;
    onDone: (interaction: DoneInteraction) => void;
    onError: (message: string) => void;
  }
) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.trim()) continue;

      try {
        const event = JSON.parse(line) as
          | { type: "delta"; text: string }
          | { type: "done"; interaction: DoneInteraction }
          | { type: "error"; message: string };

        if (event.type === "delta") handlers.onDelta(event.text);
        else if (event.type === "done") handlers.onDone(event.interaction);
        else handlers.onError(event.message);
      } catch {
        // A truncated frame is dropped rather than shown: the `done` event
        // carries the authoritative answer regardless of what the deltas did.
      }
    }
  }
}

function updateTurn(
  setTurns: React.Dispatch<React.SetStateAction<Turn[]>>,
  id: string,
  patch: Partial<Turn>
) {
  setTurns((current) => current.map((turn) => (turn.id === id ? { ...turn, ...patch } : turn)));
}

// ── Rendering ─────────────────────────────────────────────────────────────

function TurnView({
  turn,
  onAskAgain,
  busy,
}: {
  turn: Turn;
  onAskAgain: (id: string) => void;
  busy: boolean;
}) {
  return (
    <div>
      <p className="rounded-xl rounded-br-sm bg-blue-600 px-3 py-2 text-[13.5px] leading-relaxed text-white">
        {turn.question}
      </p>

      <div className="mt-2 rounded-xl rounded-bl-sm bg-slate-50 px-3 py-2.5 dark:bg-slate-800/60">
        {turn.error ? (
          <p className="text-[13px] leading-relaxed text-rose-600 dark:text-rose-400">
            {turn.error}
          </p>
        ) : turn.answer ? (
          <AnswerView answer={turn.answer} />
        ) : (
          <>
            <p className="flex items-center gap-2 text-[12px] font-medium text-slate-400">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-blue-500" />
              {turn.streaming ? "Answering..." : "Thinking..."}
            </p>
            {turn.streaming && (
              /**
               * The raw stream, shown as it arrives.
               *
               * It is JSON mid-flight and looks it. Rendering the accumulating
               * text is still worth more than a spinner: it is proof that
               * something is happening, on the slow connections §78 targets,
               * and it is replaced by the structured answer a second later.
               */
              <p className="mt-1.5 max-h-24 overflow-hidden text-[11.5px] leading-snug text-slate-400 dark:text-slate-500">
                {turn.streaming.replace(/[{}"[\]]/g, " ").slice(-320)}
              </p>
            )}
          </>
        )}
      </div>

      {turn.answer && turn.interactionId && (
        <button
          type="button"
          disabled={busy}
          onClick={() => onAskAgain(turn.interactionId as string)}
          className="mt-1.5 text-[12px] font-semibold text-slate-400 transition hover:text-blue-600 disabled:opacity-50 dark:hover:text-blue-400"
        >
          Regenerate
        </button>
      )}
    </div>
  );
}

function AnswerView({ answer }: { answer: TutorAnswer }) {
  return (
    <div className="space-y-2.5">
      {answer.offTopicNote && (
        <p className="rounded-lg bg-amber-50 px-2.5 py-1.5 text-[12px] leading-relaxed text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">
          {answer.offTopicNote}
        </p>
      )}

      <p className="text-[13.5px] font-semibold text-slate-900 dark:text-white">{answer.title}</p>
      <p className="text-[13.5px] leading-relaxed text-slate-700 dark:text-slate-200">
        {answer.explanation}
      </p>

      {answer.practicalExample && (
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Example</p>
          <p className="mt-0.5 text-[13px] leading-relaxed text-slate-600 dark:text-slate-300">
            {answer.practicalExample}
          </p>
        </div>
      )}

      {answer.code && (
        <pre className="overflow-x-auto rounded-lg bg-slate-900 p-3 text-[11.5px] leading-relaxed text-slate-100">
          <code>{answer.code}</code>
        </pre>
      )}

      {answer.keyPoints.length > 0 && (
        <ul className="space-y-1">
          {answer.keyPoints.map((point) => (
            <li key={point} className="flex gap-2 text-[12.5px] leading-relaxed text-slate-600 dark:text-slate-300">
              <span aria-hidden="true" className="mt-[6px] h-1 w-1 shrink-0 rounded-full bg-blue-500" />
              {point}
            </li>
          ))}
        </ul>
      )}

      {answer.commonMistakes.length > 0 && (
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            Watch out for
          </p>
          <ul className="mt-0.5 space-y-1">
            {answer.commonMistakes.map((mistake) => (
              <li key={mistake} className="text-[12.5px] leading-relaxed text-slate-600 dark:text-slate-300">
                {mistake}
              </li>
            ))}
          </ul>
        </div>
      )}

      {answer.relatedConcepts.length > 0 && (
        <p className="text-[12px] text-slate-400 dark:text-slate-500">
          Related: {answer.relatedConcepts.join(", ")}
        </p>
      )}
    </div>
  );
}

function EmptyState({ hasPreparedContent }: { hasPreparedContent: boolean }) {
  return (
    <div className="py-6 text-center">
      <span className="mx-auto grid h-10 w-10 place-items-center rounded-xl bg-slate-100 text-slate-400 dark:bg-slate-800">
        <ChatIcon className="h-5 w-5" />
      </span>
      <p className="mt-2.5 text-[13px] font-medium text-slate-600 dark:text-slate-300">
        Ask anything about this topic
      </p>
      <p className="mx-auto mt-1 max-w-[15rem] text-[12px] leading-relaxed text-slate-400 dark:text-slate-500">
        {hasPreparedContent
          ? "The tutor knows your subject, regulation and this unit's syllabus — and what you have already read above."
          : "The tutor knows your subject, regulation and this unit's syllabus."}
      </p>
    </div>
  );
}

/** §14: the questions this student asked before, and what each button costs. */
function PreviousQuestions({
  history,
  busy,
  onView,
  onAskAgain,
}: {
  history: PreviousQuestion[];
  busy: boolean;
  onView: (id: string) => void;
  onAskAgain: (id: string) => void;
}) {
  return (
    <section className="mt-4 rounded-2xl border border-slate-200/80 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <h2 className="text-[14px] font-semibold text-slate-900 dark:text-white">
        Previously asked
      </h2>
      <p className="mt-0.5 text-[11.5px] text-slate-400 dark:text-slate-500">
        Viewing an old answer is free. Asking again uses one of today&apos;s questions.
      </p>

      <ul className="mt-3 space-y-2.5">
        {history.slice(0, 8).map((entry) => (
          <li
            key={entry.id}
            className="rounded-xl border border-slate-200/70 p-3 dark:border-slate-800"
          >
            <p className="text-[13px] font-medium leading-snug text-slate-800 dark:text-slate-100">
              {entry.question}
            </p>
            {entry.summary && (
              <p className="mt-1 line-clamp-2 text-[12px] leading-relaxed text-slate-500 dark:text-slate-400">
                {entry.summary}
              </p>
            )}

            <div className="mt-2 flex items-center gap-3">
              <button
                type="button"
                onClick={() => void onView(entry.id)}
                className="text-[12px] font-semibold text-blue-600 transition hover:underline dark:text-blue-400"
              >
                View
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void onAskAgain(entry.id)}
                className="text-[12px] font-semibold text-slate-400 transition hover:text-slate-600 disabled:opacity-50 dark:hover:text-slate-200"
              >
                Ask again
              </button>
              <span className="ml-auto text-[11px] capitalize text-slate-300 dark:text-slate-600">
                {entry.depthLevel}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
