import { connectDB } from "@/lib/db";
import type { AiProviderType } from "@/lib/admin/ai/fields";
import type { TokenUsage } from "@/lib/admin/ai/provider";
import { AiInteraction, AiUsageDaily } from "@/models/Tutor";

/**
 * Cost tracking, per-student quotas and the platform budget (§33, §34, §69).
 *
 * Three concerns in one file because they are one decision made in three
 * places: whether this request may run. Splitting them would mean three call
 * sites in the pipeline, and the one that got forgotten would be the one that
 * mattered.
 *
 * Every number is in **micro-USD** — millionths of a dollar, as an integer.
 * Floating-point dollars accumulated across a hundred thousand rows drift, and
 * `$inc` on a float drifts differently again, so the two would eventually
 * disagree about the same month.
 */

// ── Pricing (§34) ─────────────────────────────────────────────────────────

/**
 * Per-million-token prices, in micro-USD.
 *
 * A table rather than a lookup against each vendor's API, because none of them
 * expose one and a wrong number here is visible and correctable while a missing
 * one is not. It is explicitly an **estimate**: everything downstream calls it
 * `estimatedCost`, and no invoice is reconciled against it.
 *
 * A model that is not listed falls to `DEFAULT_PRICE` rather than to zero.
 * Zero would make an unlisted model look free, which is precisely the model
 * that would then be left running for a month.
 */
type Price = { inputPerMillion: number; outputPerMillion: number };

const PRICES: Record<string, Price> = {
  // Gemini
  "gemini-2.5-flash-lite": { inputPerMillion: 100_000, outputPerMillion: 400_000 },
  "gemini-2.5-flash": { inputPerMillion: 300_000, outputPerMillion: 2_500_000 },
  "gemini-2.5-pro": { inputPerMillion: 1_250_000, outputPerMillion: 10_000_000 },
  // DeepSeek
  "deepseek-chat": { inputPerMillion: 270_000, outputPerMillion: 1_100_000 },
  "deepseek-reasoner": { inputPerMillion: 550_000, outputPerMillion: 2_190_000 },
  // Groq
  "llama-3.3-70b-versatile": { inputPerMillion: 590_000, outputPerMillion: 790_000 },
  // OpenAI
  "gpt-5.4-mini": { inputPerMillion: 250_000, outputPerMillion: 2_000_000 },
  // The mock costs nothing, and saying so keeps development out of the budget.
  "mock-tutor-1": { inputPerMillion: 0, outputPerMillion: 0 },
  "mock-1": { inputPerMillion: 0, outputPerMillion: 0 },
};

const DEFAULT_PRICE: Price = { inputPerMillion: 500_000, outputPerMillion: 1_500_000 };

export function estimateCostMicros(model: string, usage: TokenUsage): number {
  const price = PRICES[model] ?? DEFAULT_PRICE;
  const input = (usage.promptTokens * price.inputPerMillion) / 1_000_000;
  const output = (usage.completionTokens * price.outputPerMillion) / 1_000_000;
  return Math.round(input + output);
}

export function formatMicros(micros: number): string {
  return `$${(micros / 1_000_000).toFixed(micros < 10_000 ? 4 : 2)}`;
}

// ── Configuration ─────────────────────────────────────────────────────────

/**
 * Read at call time, never at import — the same rule the providers apply to
 * their keys. A limit captured at build is a limit an operator cannot change
 * without a deploy, which is not much of a control.
 */
function numberEnv(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

export type QuotaTier = "free" | "premium";

export function dailyQuestionLimit(tier: QuotaTier): number {
  return tier === "premium"
    ? numberEnv("PREMIUM_DAILY_AI_QUESTIONS", 50)
    : numberEnv("FREE_DAILY_AI_QUESTIONS", 10);
}

/** The platform's monthly ceiling, in whole dollars. 0 disables the check. */
function monthlyBudgetMicros(): number {
  return Math.round(numberEnv("AI_MONTHLY_BUDGET_USD", 0) * 1_000_000);
}

/**
 * The fraction of the budget at which the router stops using the good model.
 *
 * Degrading before the ceiling rather than at it: hitting 100% mid-month turns
 * the tutor off for everyone, while dropping to the cheap tier at 80% keeps it
 * answering for the rest of the month (§69).
 */
const DEGRADE_AT = 0.8;

// ── Quota (§33) ───────────────────────────────────────────────────────────

export type QuotaResult = {
  allowed: boolean;
  used: number;
  limit: number;
  remaining: number;
  /** Seconds until the daily window rolls over, for the `Retry-After` header. */
  resetsInSeconds: number;
};

/**
 * How many questions this student has asked today.
 *
 * Counted from `AiInteraction` rather than from a counter document, because the
 * interactions have to be written anyway and a second counter is a second thing
 * that can disagree with them. Cache hits are excluded — §17's whole point is
 * that a cached answer costs nothing, so charging a student's daily allowance
 * for one would punish exactly the behaviour the cache rewards.
 *
 * Failures are excluded too. A student whose ten questions all hit a provider
 * outage has not used their day.
 */
export async function checkDailyQuota(
  userId: string,
  tier: QuotaTier = "free"
): Promise<QuotaResult> {
  await connectDB();

  const limit = dailyQuestionLimit(tier);
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const used = await AiInteraction.countDocuments({
    userId,
    status: "ok",
    cacheHit: false,
    createdAt: { $gte: startOfDay },
  });

  const endOfDay = new Date(startOfDay);
  endOfDay.setDate(endOfDay.getDate() + 1);

  return {
    allowed: used < limit,
    used,
    limit,
    remaining: Math.max(0, limit - used),
    resetsInSeconds: Math.max(1, Math.ceil((endOfDay.getTime() - Date.now()) / 1000)),
  };
}

// ── Budget (§69) ──────────────────────────────────────────────────────────

export type BudgetState = {
  /** No budget configured — the check is off, and says so rather than passing. */
  enforced: boolean;
  spentMicros: number;
  budgetMicros: number;
  /** Above the ceiling: expensive tiers are refused outright. */
  exhausted: boolean;
  /** Past the degrade threshold: the advanced tier drops to the cheap one. */
  degraded: boolean;
};

export async function checkBudget(): Promise<BudgetState> {
  const budgetMicros = monthlyBudgetMicros();
  if (budgetMicros <= 0) {
    return { enforced: false, spentMicros: 0, budgetMicros: 0, exhausted: false, degraded: false };
  }

  await connectDB();

  /**
   * A sum over the daily roll-up, not over `AiInteraction`.
   *
   * This runs before every request. At most thirty-one small documents are
   * touched, against an index, whichever month it is — an aggregation over a
   * growing interaction collection would be fine for a term and then would not.
   */
  const rows = await AiUsageDaily.find({ month: currentMonth() })
    .select("estimatedCostMicros")
    .lean();

  const spentMicros = rows.reduce((total, row) => total + (row.estimatedCostMicros ?? 0), 0);

  return {
    enforced: true,
    spentMicros,
    budgetMicros,
    exhausted: spentMicros >= budgetMicros,
    degraded: spentMicros >= budgetMicros * DEGRADE_AT,
  };
}

export function currentMonth(now: Date = new Date()): string {
  return now.toISOString().slice(0, 7);
}

export function currentDay(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

// ── Recording (§34, §52) ──────────────────────────────────────────────────

export type UsageRecord = {
  providerType: AiProviderType | string;
  model: string;
  usage: TokenUsage;
  costMicros: number;
  latencyMs: number;
  cacheHit: boolean;
  failed: boolean;
};

/**
 * Add one request to the day's roll-up.
 *
 * Never throws. Accounting that can fail a request would mean a student loses
 * an answer because a counter could not be written — and the interaction row,
 * which is the record that actually matters, has already been stored by the
 * time this runs.
 */
export async function recordUsage(record: UsageRecord): Promise<void> {
  try {
    await connectDB();

    const now = new Date();
    await AiUsageDaily.updateOne(
      {
        day: currentDay(now),
        provider: String(record.providerType),
        model: record.model || "unknown",
      },
      {
        $setOnInsert: { month: currentMonth(now) },
        $inc: {
          requests: 1,
          cacheHits: record.cacheHit ? 1 : 0,
          failures: record.failed ? 1 : 0,
          inputTokens: record.usage.promptTokens,
          outputTokens: record.usage.completionTokens,
          estimatedCostMicros: record.costMicros,
          totalLatencyMs: record.latencyMs,
        },
      },
      { upsert: true }
    );
  } catch (err) {
    console.error("[tutor] could not record usage:", err);
  }
}
