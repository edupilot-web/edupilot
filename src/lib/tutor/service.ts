import { Types } from "mongoose";
import { connectDB } from "@/lib/db";
import { ProviderError } from "@/lib/admin/ai/provider";
import { parseJsonResponse } from "@/lib/admin/ai/provider";
import {
  followUp,
  tierForDepth,
  type DepthLevel,
  type LearningLanguage,
} from "@/lib/learning/fields";
import { authorizeTopic, recordEvent, recordProgress } from "@/lib/learning/progress";
import { AiConversation, AiInteraction } from "@/models/Tutor";
import {
  buildDeepDivePrompt,
  buildSummaryPrompt,
  buildTutorPrompt,
  PROMPT_VERSION,
  type BuiltTutorPrompt,
} from "@/lib/tutor/prompt";
import {
  buildTutorContext,
  contextFingerprint,
  SUMMARIZE_AFTER_TURNS,
  type TutorContext,
} from "@/lib/tutor/context";
import { cacheEnabled, questionHash, normalizeQuestion, readCache, writeCache } from "@/lib/tutor/cache";
import { routeStructured, streamingRoute, type RouteEntry } from "@/lib/tutor/router";
import { fallbackAnswer, parseTutorAnswer, TUTOR_ANSWER_JSON_SCHEMA, type TutorAnswer } from "@/lib/tutor/schema";
import {
  checkBudget,
  checkDailyQuota,
  estimateCostMicros,
  recordUsage,
  type QuotaTier,
} from "@/lib/tutor/usage";

/**
 * AITutorService — the request pipeline §67 describes, in order.
 *
 *   authenticate (the route) → authorise the topic → build context → normalise
 *   the question → check the cache → check the quota → check the budget →
 *   choose a tier → call the router → validate → store → account → return
 *
 * The order is not arbitrary. Authorisation precedes context, because an
 * unauthorised topic must not cause a database read of another college's
 * syllabus. The cache is checked *before* the quota, so a student at their
 * limit still gets cached answers — those call no provider, and the daily
 * count already excludes them. The budget is checked last, and mostly decides
 * the *tier* rather than refusing outright.
 *
 * Everything a caller can influence is an id or a string. No caller anywhere —
 * browser, route handler or test — can choose a provider, a model, a
 * temperature or a prompt (§18, §35).
 */

// ── Public shapes ─────────────────────────────────────────────────────────

export type AskMode = "question" | "deep-dive";

export type AskInput = {
  userId: string;
  topicId: string;
  subtopicId?: string | null;
  conversationId?: string | null;
  /** Free text. Ignored when `followUpAction` is set — the action owns the wording. */
  question?: string | null;
  followUpAction?: string | null;
  depthLevel?: DepthLevel | null;
  language?: LearningLanguage | null;
  mode: AskMode;
  /** "Ask again" / "Regenerate": bypass the cache and store a separate row (§15, §40). */
  forceFresh?: boolean;
  /** The answer this one replaces, for the comparison UI. */
  regeneratedFromId?: string | null;
  quotaTier?: QuotaTier;
};

export type StoredInteraction = {
  id: string;
  conversationId: string;
  sequence: number;
  question: string;
  answer: TutorAnswer;
  depthLevel: DepthLevel;
  language: LearningLanguage;
  cacheHit: boolean;
  provider: string | null;
  model: string | null;
  latencyMs: number;
  totalTokens: number;
  createdAt: string;
};

export type AskRefusal = {
  ok: false;
  code:
    | "no-profile"
    | "incomplete-profile"
    | "topic-not-found"
    | "subtopic-not-found"
    | "conversation-not-found"
    | "empty-question"
    | "question-too-long"
    | "quota-exceeded"
    | "budget-exceeded"
    | "provider-unavailable";
  message: string;
  status: number;
  retryAfterSeconds?: number;
};

export type AskSuccess = { ok: true; interaction: StoredInteraction };
export type AskResult = AskSuccess | AskRefusal;

// ── Generation settings ───────────────────────────────────────────────────

/**
 * Fixed, not configurable per request (§65).
 *
 * A caller-supplied `maxTokens` is a caller-supplied bill, and a
 * caller-supplied temperature is a way around the prompt's own constraints.
 * The numbers differ by depth because an Expert answer legitimately needs room
 * a Basic one does not — but the choice of which is which is the server's.
 */
function generationSettings(depth: DepthLevel) {
  const deep = depth === "advanced" || depth === "expert";
  return {
    temperature: 0.3,
    topP: 0.95,
    maxTokens: deep ? 4096 : 2048,
    /**
     * Shorter than the admin module's two minutes. A student is watching this
     * one: past about forty seconds they have concluded it is broken, and a
     * timeout that fires after they have given up is worse than a fallback that
     * fires while they are still there.
     */
    timeoutMs: 45_000,
  };
}

/** Questions longer than this are a paste, not a question. */
const MAX_QUESTION_LENGTH = 2000;

// ── Entry point ───────────────────────────────────────────────────────────

/**
 * The non-streaming path: the whole pipeline, one awaited result.
 *
 * Used by "Ask again", by the retry endpoint and by any client that cannot
 * consume a stream. The streaming path below shares every stage of it except
 * the provider call itself, which is the only part that differs.
 */
export async function ask(input: AskInput): Promise<AskResult> {
  const prepared = await prepare(input);
  if (prepared.kind === "refused") return prepared.refusal;
  if (prepared.kind === "cached") return { ok: true, interaction: prepared.interaction };

  const { context, prompt, question, depth } = prepared;
  const settings = generationSettings(depth);
  const started = Date.now();

  const routed = await routeStructured(
    { system: prompt.system, user: prompt.user },
    {
      tier: prepared.tier,
      temperature: settings.temperature,
      maxTokens: settings.maxTokens,
      topP: settings.topP,
      timeoutMs: settings.timeoutMs,
      jsonSchema: TUTOR_ANSWER_JSON_SCHEMA,
    }
  );

  if (!routed.ok) {
    // Stored even though it failed: §34's failure rate is only measurable if
    // the failures are written down, and a student asking "where did my
    // question go" deserves to find it in their history.
    await storeFailure({
      input,
      context,
      question,
      depth,
      errorCode: routed.errorCode,
      message: routed.attempts.at(-1)?.message ?? routed.message,
      attempts: routed.attempts.map((attempt) => attempt.providerType),
      latencyMs: Date.now() - started,
    });

    return {
      ok: false,
      code: "provider-unavailable",
      message: routed.message,
      status: 503,
    };
  }

  const parsed = await validateOrRetry({
    text: routed.result.text,
    prompt,
    tier: prepared.tier,
    settings,
    topicTitle: context.topic.title,
    depth,
  });

  const interaction = await store({
    input,
    context,
    question,
    depth,
    answer: parsed.answer,
    rawResponse: parsed.valid ? null : routed.result.text,
    provider: routed.providerType,
    model: routed.model,
    usage: {
      promptTokens: routed.result.usage.promptTokens + parsed.extraUsage.promptTokens,
      completionTokens: routed.result.usage.completionTokens + parsed.extraUsage.completionTokens,
      totalTokens: routed.result.usage.totalTokens + parsed.extraUsage.totalTokens,
    },
    latencyMs: Date.now() - started,
    cacheHit: false,
    fallbackFrom: routed.attempts.map((attempt) => attempt.providerType),
  });

  return { ok: true, interaction };
}

// ── Preparation, shared by both paths ─────────────────────────────────────

export type PreparedAsk = {
  kind: "ready";
  context: TutorContext;
  prompt: BuiltTutorPrompt;
  question: string;
  depth: DepthLevel;
  tier: ReturnType<typeof tierForDepth>;
  /** Whether the answer, once produced, may be written to the shared cache. */
  cacheable: boolean;
};

type PrepareResult =
  | PreparedAsk
  | { kind: "refused"; refusal: AskRefusal }
  | { kind: "cached"; interaction: StoredInteraction };

/**
 * Everything before the provider call.
 *
 * Exported so the streaming route can run it, decide whether it has anything to
 * stream, and send headers *before* opening the stream — a refusal discovered
 * after the response has started can only be delivered as a message inside a
 * stream the client has already begun rendering as an answer.
 */
export async function prepare(input: AskInput): Promise<PrepareResult> {
  const action = input.followUpAction ? followUp(input.followUpAction) : null;

  // The action's depth wins over the request's: pressing "Explain more simply"
  // and staying at Expert is not a thing the button can mean.
  const depth: DepthLevel =
    action?.depth ?? input.depthLevel ?? (input.mode === "deep-dive" ? "advanced" : "basic");

  const contextResult = await buildTutorContext({
    userId: input.userId,
    topicId: input.topicId,
    subtopicId: input.subtopicId,
    conversationId: input.conversationId,
    depthLevel: depth,
    language: input.language ?? "english",
  });

  if (!contextResult.ok) {
    const status =
      contextResult.code === "topic-not-found" || contextResult.code === "subtopic-not-found"
        ? 404
        : contextResult.code === "conversation-not-found"
          ? 404
          : 409;

    return {
      kind: "refused",
      refusal: { ok: false, code: contextResult.code, message: contextResult.message, status },
    };
  }

  const context = contextResult.context;

  // The action owns its wording (§16). Free text is only used when there is no
  // action, so a client cannot send "code" as the action and arbitrary text as
  // the question and have the two disagree in the stored history.
  const question = action
    ? action.question(context.topic.title)
    : (input.question ?? "").trim();

  if (input.mode === "question" && !question) {
    return {
      kind: "refused",
      refusal: {
        ok: false,
        code: "empty-question",
        message: "Type a question first.",
        status: 400,
      },
    };
  }
  if (question.length > MAX_QUESTION_LENGTH) {
    return {
      kind: "refused",
      refusal: {
        ok: false,
        code: "question-too-long",
        message: `Keep your question under ${MAX_QUESTION_LENGTH} characters.`,
        status: 400,
      },
    };
  }

  const prompt =
    input.mode === "deep-dive"
      ? buildDeepDivePrompt(context)
      : buildTutorPrompt({ context, question, followUpAction: action?.label ?? null });

  const effectiveQuestion = input.mode === "deep-dive" ? deepDiveQuestion(context) : question;

  /**
   * Cacheable only when nothing personal is in the prompt (§47).
   *
   * A question with turns behind it depends on what *this* student asked
   * earlier, so its answer is theirs and must not be served to anyone else.
   * This is the single place that distinction is made, and it is why the cache
   * module documents that it cannot enforce it alone.
   */
  const cacheable =
    cacheEnabled() && context.recentTurns.length === 0 && !context.conversationSummary;

  /**
   * The cache is checked **before** the quota (§17, §33).
   *
   * A cached answer calls no provider and costs nothing, so charging a
   * student's daily allowance for one would punish exactly the behaviour the
   * cache exists to reward — and it would contradict the counting itself,
   * which already excludes `cacheHit` rows from the daily total. A student at
   * their limit can still read every answer the platform already has.
   *
   * The consequence to be deliberate about: a student who has run out can
   * still ask *popular* questions and get instant answers, while an original
   * one is refused. That is the right way round. The limit exists to cap
   * spending, not to ration reading.
   */
  if (cacheable && !input.forceFresh) {
    const cached = await readCache({
      topicId: context.topic.id,
      question: effectiveQuestion,
      depthLevel: depth,
      language: context.language,
      promptVersion: PROMPT_VERSION,
    });

    if (cached) {
      const interaction = await store({
        input,
        context,
        question: effectiveQuestion,
        depth,
        answer: cached.answer,
        rawResponse: null,
        provider: cached.provider ?? "cache",
        model: cached.model ?? "cache",
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        latencyMs: 0,
        cacheHit: true,
        fallbackFrom: [],
      });
      return { kind: "cached", interaction };
    }
  }

  // ── Quota (§33) ─────────────────────────────────────────────────────────
  // Reached only when a provider call is actually required.
  const quota = await checkDailyQuota(input.userId, input.quotaTier ?? "free");
  if (!quota.allowed) {
    return {
      kind: "refused",
      refusal: {
        ok: false,
        code: "quota-exceeded",
        message: `You have used all ${quota.limit} AI questions for today. Your previous answers are still available to read, and the limit resets at midnight.`,
        status: 429,
        retryAfterSeconds: quota.resetsInSeconds,
      },
    };
  }

  // ── Budget (§69) ────────────────────────────────────────────────────────
  const budget = await checkBudget();
  if (budget.enforced && budget.exhausted) {
    return {
      kind: "refused",
      refusal: {
        ok: false,
        code: "budget-exceeded",
        message:
          "The AI tutor has reached this month's usage limit. Your saved explanations and previous answers are still available.",
        status: 503,
      },
    };
  }

  /**
   * Degrade rather than refuse (§69).
   *
   * Past the threshold every request runs on the cheap tier, including the ones
   * that asked for depth. A shallower answer is a far better outcome than a
   * tutor that stops working three weeks into the month.
   */
  const tier = budget.degraded ? "default" : tierForDepth(depth);

  return { kind: "ready", context, prompt, question: effectiveQuestion, depth, tier, cacheable };
}

function deepDiveQuestion(context: TutorContext): string {
  return context.subtopic
    ? `Go deeper: ${context.topic.title} — ${context.subtopic.title}`
    : `Go deeper: ${context.topic.title}`;
}

// ── Streaming (§77) ───────────────────────────────────────────────────────

export type StreamEvent =
  | { type: "delta"; text: string }
  | { type: "done"; interaction: StoredInteraction }
  | { type: "error"; message: string };

/**
 * Stream one answer, then store it.
 *
 * The transport streams **raw model text**, not parsed fields. The alternative
 * — incrementally parsing JSON server-side and emitting partial objects — needs
 * a streaming JSON parser to be correct, and gets the client nothing it cannot
 * do itself: the panel shows the accumulating text while it arrives and swaps
 * to the structured render on `done`.
 *
 * Failure has two very different shapes, and they are handled differently:
 *
 *   - **before the first byte** — nothing has been sent, so the whole request
 *     falls back to `ask()`, which runs the full chain with every provider.
 *   - **after the first byte** — the client is already rendering. A second
 *     provider's stream cannot be spliced onto the first, so the error is sent
 *     as an event and the client offers Retry.
 */
export async function* askStreaming(input: AskInput): AsyncGenerator<StreamEvent> {
  const prepared = await prepare(input);

  if (prepared.kind === "refused") {
    yield { type: "error", message: prepared.refusal.message };
    return;
  }
  if (prepared.kind === "cached") {
    // A cached answer is not streamed. Faking a token-by-token reveal of text
    // that is already in hand would be a deliberate slowdown of the fastest
    // path in the system.
    yield { type: "done", interaction: prepared.interaction };
    return;
  }

  const { context, prompt, question, depth } = prepared;
  const settings = generationSettings(depth);
  const route: RouteEntry[] = streamingRoute(prepared.tier);

  if (!route.length) {
    const result = await ask(input);
    if (result.ok) yield { type: "done", interaction: result.interaction };
    else yield { type: "error", message: result.message };
    return;
  }

  const entry = route[0];
  const started = Date.now();
  let text = "";
  let flushed = false;

  try {
    const stream = entry.provider.stream?.(
      { system: prompt.system, user: prompt.user },
      {
        model: entry.model,
        temperature: settings.temperature,
        maxTokens: settings.maxTokens,
        topP: settings.topP,
        timeoutMs: settings.timeoutMs,
        jsonSchema: TUTOR_ANSWER_JSON_SCHEMA,
      }
    );

    if (!stream) throw new ProviderError("unavailable", "The provider cannot stream.");

    for await (const chunk of stream) {
      if (chunk.delta) {
        text += chunk.delta;
        flushed = true;
        yield { type: "delta", text: chunk.delta };
      }
      if (chunk.done) break;
    }
  } catch (err) {
    const message =
      err instanceof ProviderError
        ? err.message
        : "The AI tutor is temporarily unavailable. Please try again.";

    if (!flushed) {
      // Nothing reached the client. Run the full chain instead.
      const result = await ask(input);
      if (result.ok) yield { type: "done", interaction: result.interaction };
      else yield { type: "error", message: result.message };
      return;
    }

    await storeFailure({
      input,
      context,
      question,
      depth,
      errorCode: err instanceof ProviderError ? err.code : "unknown",
      message,
      attempts: [entry.providerType],
      latencyMs: Date.now() - started,
    });

    yield { type: "error", message: "The answer was cut short. Try asking again." };
    return;
  }

  const parsed = await validateOrRetry({
    text,
    prompt,
    tier: prepared.tier,
    settings,
    topicTitle: context.topic.title,
    depth,
  });

  /**
   * Token counts are estimated for a stream.
   *
   * Most of these services send usage only in a final frame, some send none at
   * all, and the accumulated text is what actually exists here. The estimate is
   * marked as such nowhere in the UI because nowhere in the UI shows it — it
   * feeds the cost roll-up, which is explicitly an estimate already (§34).
   */
  const usage = {
    promptTokens: Math.ceil((prompt.system.length + prompt.user.length) / 4),
    completionTokens: Math.ceil(text.length / 4),
    totalTokens: 0,
  };
  usage.totalTokens = usage.promptTokens + usage.completionTokens;

  const interaction = await store({
    input,
    context,
    question,
    depth,
    answer: parsed.answer,
    rawResponse: parsed.valid ? null : text,
    provider: entry.providerType,
    model: entry.model,
    usage,
    latencyMs: Date.now() - started,
    cacheHit: false,
    fallbackFrom: [],
  });

  yield { type: "done", interaction };
}

// ── Validation (§64) ──────────────────────────────────────────────────────

/**
 * Parse the response; on failure, ask once more with the errors quoted back.
 *
 * One retry, not a loop. A model that produced malformed JSON twice against a
 * schema *and* a correction listing its own mistakes is not going to produce
 * valid JSON on the third attempt — it is going to produce a third bill.
 *
 * The correction runs on the cheap tier regardless of the original: fixing
 * JSON is not a task that needs the better model.
 */
async function validateOrRetry(input: {
  text: string;
  prompt: BuiltTutorPrompt;
  tier: ReturnType<typeof tierForDepth>;
  settings: ReturnType<typeof generationSettings>;
  topicTitle: string;
  depth: DepthLevel;
}): Promise<{
  answer: TutorAnswer;
  valid: boolean;
  extraUsage: { promptTokens: number; completionTokens: number; totalTokens: number };
}> {
  const empty = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

  const first = parseJsonResponse(input.text);
  if (first.ok) {
    const parsed = parseTutorAnswer(first.value);
    if (parsed.ok) return { answer: parsed.answer, valid: true, extraUsage: empty };

    const retried = await correctionAttempt(input, parsed.issues);
    if (retried) return retried;
  } else {
    const retried = await correctionAttempt(input, [first.reason]);
    if (retried) return retried;
  }

  return {
    answer: fallbackAnswer(input.topicTitle, input.depth),
    valid: false,
    extraUsage: empty,
  };
}

async function correctionAttempt(
  input: {
    prompt: BuiltTutorPrompt;
    settings: ReturnType<typeof generationSettings>;
    text: string;
  },
  issues: string[]
): Promise<{
  answer: TutorAnswer;
  valid: boolean;
  extraUsage: { promptTokens: number; completionTokens: number; totalTokens: number };
} | null> {
  const routed = await routeStructured(
    {
      system: input.prompt.system,
      user: [
        input.prompt.user,
        "",
        "Your previous reply did not match the required JSON shape. The problems were:",
        ...issues.slice(0, 6).map((issue) => `- ${issue}`),
        "",
        "Reply again with the same answer, corrected. Output the JSON object only.",
      ].join("\n"),
    },
    {
      tier: "default",
      temperature: 0,
      maxTokens: input.settings.maxTokens,
      topP: 1,
      timeoutMs: input.settings.timeoutMs,
      jsonSchema: TUTOR_ANSWER_JSON_SCHEMA,
    }
  );

  if (!routed.ok) return null;

  const parsedJson = parseJsonResponse(routed.result.text);
  if (!parsedJson.ok) return null;

  const parsed = parseTutorAnswer(parsedJson.value);
  if (!parsed.ok) return null;

  return {
    answer: parsed.answer,
    valid: true,
    extraUsage: {
      promptTokens: routed.result.usage.promptTokens,
      completionTokens: routed.result.usage.completionTokens,
      totalTokens: routed.result.usage.totalTokens,
    },
  };
}

// ── Storage (§14, §23) ────────────────────────────────────────────────────

type StoreInput = {
  input: AskInput;
  context: TutorContext;
  question: string;
  depth: DepthLevel;
  answer: TutorAnswer;
  rawResponse: string | null;
  provider: string;
  model: string;
  usage: { promptTokens: number; completionTokens: number; totalTokens: number };
  latencyMs: number;
  cacheHit: boolean;
  fallbackFrom: string[];
};

async function store(payload: StoreInput): Promise<StoredInteraction> {
  await connectDB();

  const conversation = await ensureConversation(payload);
  const sequence = (conversation.messageCount ?? 0) + 1;

  const costMicros = payload.cacheHit
    ? 0
    : estimateCostMicros(payload.model, {
        promptTokens: payload.usage.promptTokens,
        completionTokens: payload.usage.completionTokens,
        totalTokens: payload.usage.totalTokens,
      });

  const interaction = await AiInteraction.create({
    userId: payload.input.userId,
    conversationId: conversation._id,
    subjectId: payload.context.subject.id,
    topicId: payload.context.topic.id,
    subtopicId: payload.context.subtopic?.id ?? null,
    sequence,
    question: payload.question,
    normalizedQuestion: normalizeQuestion(payload.question),
    questionHash: questionHash(payload.question),
    answer: payload.answer,
    rawResponse: payload.rawResponse,
    depthLevel: payload.depth,
    language: payload.context.language,
    followUpAction: payload.input.followUpAction ?? null,
    provider: payload.provider,
    model: payload.model,
    promptVersion: PROMPT_VERSION,
    contextHash: contextFingerprint(payload.context),
    inputTokens: payload.usage.promptTokens,
    outputTokens: payload.usage.completionTokens,
    totalTokens: payload.usage.totalTokens,
    estimatedCostMicros: costMicros,
    latencyMs: payload.latencyMs,
    cacheHit: payload.cacheHit,
    fallbackFrom: payload.fallbackFrom,
    status: "ok",
    regeneratedFromId:
      payload.input.regeneratedFromId && Types.ObjectId.isValid(payload.input.regeneratedFromId)
        ? payload.input.regeneratedFromId
        : null,
  });

  await AiConversation.updateOne(
    { _id: conversation._id },
    {
      $set: {
        lastMessageAt: new Date(),
        depthLevel: payload.depth,
        // The thread's title comes from its first question and then stops
        // changing: a list whose entries rename themselves as a conversation
        // goes on is a list nobody can find anything in.
        ...(conversation.title ? {} : { title: titleFor(payload.question) }),
      },
      $inc: { messageCount: 1 },
    }
  );

  /**
   * Everything after this point is bookkeeping, and none of it may fail the
   * request — the student has their answer, and losing it because a counter
   * could not be written would be the worst possible trade.
   */
  await Promise.allSettled([
    recordUsage({
      providerType: payload.provider,
      model: payload.model,
      usage: payload.usage,
      costMicros,
      latencyMs: payload.latencyMs,
      cacheHit: payload.cacheHit,
      failed: false,
    }),
    payload.cacheHit
      ? Promise.resolve()
      : maybeCache(payload),
    trackProgress(payload),
    maybeSummarize(String(conversation._id), payload.context, sequence),
  ]);

  return {
    id: String(interaction._id),
    conversationId: String(conversation._id),
    sequence,
    question: payload.question,
    answer: payload.answer,
    depthLevel: payload.depth,
    language: payload.context.language,
    cacheHit: payload.cacheHit,
    provider: payload.provider,
    model: payload.model,
    latencyMs: payload.latencyMs,
    totalTokens: payload.usage.totalTokens,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Only genuinely reusable answers go into the shared cache.
 *
 * Three exclusions, each for its own reason: a conversation-dependent answer is
 * personal (§47); a fallback answer is an apology and caching it would serve
 * the apology to everyone who asks the same question for a month; and a
 * regeneration was explicitly asked for *because* the cached shape of the
 * question was not wanted.
 */
async function maybeCache(payload: StoreInput): Promise<void> {
  const conversational =
    payload.context.recentTurns.length > 0 || Boolean(payload.context.conversationSummary);

  if (conversational || payload.rawResponse !== null || payload.input.forceFresh) return;
  if (!cacheEnabled()) return;

  await writeCache({
    topicId: payload.context.topic.id,
    question: payload.question,
    depthLevel: payload.depth,
    language: payload.context.language,
    promptVersion: PROMPT_VERSION,
    answer: payload.answer,
    provider: payload.provider,
    model: payload.model,
    costMicros: estimateCostMicros(payload.model, payload.usage),
  });
}

/** Asking counts as learning (§24), and a deep dive counts as reading deeper. */
async function trackProgress(payload: StoreInput): Promise<void> {
  const ownership = await authorizeTopic(payload.input.userId, payload.context.topic.id);
  if (!ownership) return;

  await recordProgress({
    userId: payload.input.userId,
    ownership,
    signals:
      payload.input.mode === "deep-dive" ? ["advancedViewed", "questionAsked"] : ["questionAsked"],
    deepestLevel: payload.depth,
    questionAsked: true,
  });

  await recordEvent({
    userId: payload.input.userId,
    type: payload.input.mode === "deep-dive" ? "ADVANCED_REQUESTED" : "AI_QUESTION_ASKED",
    ownership,
    subtopicId: payload.context.subtopic?.id ?? null,
    meta: {
      depthLevel: payload.depth,
      cacheHit: payload.cacheHit,
      provider: payload.provider,
    },
  });
}

async function ensureConversation(payload: StoreInput) {
  if (payload.context.conversationId) {
    const existing = await AiConversation.findOne({
      _id: payload.context.conversationId,
      userId: payload.input.userId,
    }).lean();
    if (existing) return existing;
  }

  const created = await AiConversation.create({
    userId: payload.input.userId,
    subjectId: payload.context.subject.id,
    topicId: payload.context.topic.id,
    subjectName: payload.context.subject.name,
    topicTitle: payload.context.topic.title,
    title: titleFor(payload.question),
    depthLevel: payload.depth,
    language: payload.context.language,
    messageCount: 0,
  });

  return created.toObject();
}

function titleFor(question: string): string {
  const cleaned = question.replace(/\s+/g, " ").trim();
  return cleaned.length > 90 ? `${cleaned.slice(0, 87)}...` : cleaned;
}

/**
 * Compress the thread once it outgrows the context window (§66).
 *
 * Runs after the answer is returned, not before the next question, so the cost
 * never lands inside a request a student is waiting on. It uses the cheap tier
 * and it is allowed to fail silently: an un-summarised thread simply sends
 * fewer verbatim turns next time, which is a slightly worse answer rather than
 * a broken one.
 */
async function maybeSummarize(
  conversationId: string,
  context: TutorContext,
  sequence: number
): Promise<void> {
  if (sequence < SUMMARIZE_AFTER_TURNS) return;

  try {
    const conversation = await AiConversation.findById(conversationId)
      .select("summarizedThrough")
      .lean();

    const from = conversation?.summarizedThrough ?? 0;
    if (sequence - from < SUMMARIZE_AFTER_TURNS) return;

    const turns = await AiInteraction.find({
      conversationId,
      status: "ok",
      sequence: { $gt: from, $lte: sequence },
    })
      .select("question answer.summary")
      .sort({ sequence: 1 })
      .lean();

    if (turns.length < SUMMARIZE_AFTER_TURNS) return;

    const prompt = buildSummaryPrompt({
      topicTitle: context.topic.title,
      turns: turns.map((turn) => ({
        question: turn.question,
        answerSummary: turn.answer?.summary ?? "",
      })),
    });

    const routed = await routeStructured(
      { system: prompt.system, user: prompt.user },
      {
        tier: "default",
        temperature: 0.2,
        maxTokens: 400,
        topP: 1,
        timeoutMs: 20_000,
        jsonSchema: null,
      }
    );

    if (!routed.ok) return;

    await AiConversation.updateOne(
      { _id: conversationId },
      { $set: { summary: routed.result.text.slice(0, 4000), summarizedThrough: sequence } }
    );
  } catch (err) {
    console.error("[tutor] conversation summary failed:", err);
  }
}

async function storeFailure(payload: {
  input: AskInput;
  context: TutorContext;
  question: string;
  depth: DepthLevel;
  errorCode: string;
  message: string;
  attempts: string[];
  latencyMs: number;
}): Promise<void> {
  try {
    await connectDB();

    const conversation = payload.context.conversationId
      ? await AiConversation.findOne({
          _id: payload.context.conversationId,
          userId: payload.input.userId,
        })
          .select("_id messageCount")
          .lean()
      : null;

    if (conversation) {
      await AiInteraction.create({
        userId: payload.input.userId,
        conversationId: conversation._id,
        subjectId: payload.context.subject.id,
        topicId: payload.context.topic.id,
        subtopicId: payload.context.subtopic?.id ?? null,
        sequence: (conversation.messageCount ?? 0) + 1,
        question: payload.question,
        normalizedQuestion: normalizeQuestion(payload.question),
        questionHash: questionHash(payload.question),
        depthLevel: payload.depth,
        language: payload.context.language,
        promptVersion: PROMPT_VERSION,
        latencyMs: payload.latencyMs,
        status: "failed",
        errorCode: payload.errorCode,
        // Operator-facing only. The route returns the sentence from the router,
        // never this (§51).
        errorMessage: payload.message.slice(0, 1000),
        fallbackFrom: payload.attempts,
      });
    }

    await recordUsage({
      providerType: payload.attempts.at(-1) ?? "unknown",
      model: "unknown",
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      costMicros: 0,
      latencyMs: payload.latencyMs,
      cacheHit: false,
      failed: true,
    });
  } catch (err) {
    console.error("[tutor] could not record a failed interaction:", err);
  }
}
