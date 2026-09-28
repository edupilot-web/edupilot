import {
  ProviderError,
  type AIProvider,
  type ProviderMessage,
  type ProviderOptions,
  type ProviderResult,
} from "@/lib/admin/ai/provider";
import type { AiProviderType } from "@/lib/admin/ai/fields";
import { IMPLEMENTED_PROVIDERS, defaultModelFor, providerFor } from "@/lib/admin/ai/settings";
import type { ModelTier } from "@/lib/learning/fields";
import { MockTutorProvider } from "@/lib/tutor/providers/mock-tutor";

/**
 * LLMRouter (§18, §19, §68).
 *
 * Decides which model answers a question, and what happens when it does not.
 * Two responsibilities that belong together: a fallback chain that did not know
 * the tier would fall from a cheap model onto an expensive one on the first
 * timeout, which is exactly the bill §69 exists to prevent.
 *
 * The chain is **configuration**, not code (§19). Model names and providers come
 * from the environment, so switching a deployment from Gemini to DeepSeek is a
 * variable change with no build — and the frontend cannot influence it at all
 * (§18), because nothing in a request names a provider.
 *
 * Nothing here talks to a vendor. Every entry is an `AIProvider` from the
 * existing seam in `admin/ai/provider.ts`; this file only chooses between them.
 */

export type RouteEntry = {
  providerType: AiProviderType;
  model: string;
  provider: AIProvider;
};

export type RouterAttempt = {
  providerType: AiProviderType;
  model: string;
  errorCode: string;
  message: string;
};

export type RouterSuccess = {
  ok: true;
  result: ProviderResult;
  providerType: AiProviderType;
  model: string;
  /** Every provider tried and failed before this one (§14 `fallbackFrom`). */
  attempts: RouterAttempt[];
};

export type RouterFailure = {
  ok: false;
  attempts: RouterAttempt[];
  /** The last error, already worded for a student (§51). */
  message: string;
  errorCode: string;
};

export type RouterResult = RouterSuccess | RouterFailure;

// ── Configuration (§19) ───────────────────────────────────────────────────

/**
 * Read at call time, never at import.
 *
 * A module-level constant would be captured at build on a serverless platform
 * and would keep serving the model name a deployment had last week. The same
 * rule the providers already apply to their keys, for the same reason.
 */
function env(name: string): string | null {
  return process.env[name]?.trim() || null;
}

function asProviderType(value: string | null): AiProviderType | null {
  if (!value) return null;
  return IMPLEMENTED_PROVIDERS.includes(value as AiProviderType)
    ? (value as AiProviderType)
    : null;
}

/**
 * The defaults, when nothing is configured.
 *
 * The mock, not Gemini. A deployment with no keys must still be able to walk
 * the whole student flow (§75), and a tutor that says "AI is unavailable" on a
 * fresh clone is indistinguishable from one that is broken. Everything the mock
 * writes says it is placeholder text.
 */
const DEFAULT_TIER: Record<ModelTier, { provider: AiProviderType; model: string }> = {
  default: { provider: "mock", model: "mock-tutor-1" },
  advanced: { provider: "mock", model: "mock-tutor-1" },
};

function tierConfig(tier: ModelTier): { provider: AiProviderType; model: string } {
  const prefix = tier === "advanced" ? "AI_ADVANCED" : "AI_DEFAULT";
  const provider = asProviderType(env(`${prefix}_PROVIDER`));
  if (!provider) return DEFAULT_TIER[tier];

  return {
    provider,
    model: env(`${prefix}_MODEL`) || defaultModelFor(provider),
  };
}

/**
 * The ordered fallback chain (§68).
 *
 * `AI_FALLBACK_PROVIDERS` is a comma-separated list, so the order is an
 * operator's decision rather than one baked in here — a deployment that trusts
 * DeepSeek more than OpenAI writes them in that order. Unknown names are
 * dropped silently rather than failing the request: a typo in an environment
 * variable must not take the tutor down.
 */
function fallbackChain(): { provider: AiProviderType; model: string }[] {
  const raw = env("AI_FALLBACK_PROVIDERS");
  if (!raw) return [];

  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      // "deepseek:deepseek-reasoner" pins a model; "deepseek" takes the default.
      const [name, model] = entry.split(":");
      const provider = asProviderType(name);
      if (!provider) return null;
      return { provider, model: model?.trim() || defaultModelFor(provider) };
    })
    .filter((entry): entry is { provider: AiProviderType; model: string } => entry !== null);
}

/**
 * Build the ordered list of what to try, for one tier.
 *
 * The advanced tier falls back through the default tier before reaching the
 * configured fallbacks: a cheaper model answering is better than no answer, and
 * far better than escalating to a third-party provider that may not be
 * configured either. Duplicates are removed so a provider that is both the
 * default and the first fallback is not tried twice — which would double the
 * wait before the chain moves on.
 */
export function buildRoute(tier: ModelTier): RouteEntry[] {
  const wanted = [
    tierConfig(tier),
    ...(tier === "advanced" ? [tierConfig("default")] : []),
    ...fallbackChain(),
  ];

  const seen = new Set<string>();
  const route: RouteEntry[] = [];

  for (const entry of wanted) {
    const key = `${entry.provider}:${entry.model}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const provider = instantiate(entry.provider);
    // An unconfigured provider is skipped at *build* time rather than failing
    // at call time, so the chain's length reflects what can actually be tried.
    if (!provider.isConfigured()) continue;

    route.push({ providerType: entry.provider, model: entry.model, provider });
  }

  /**
   * The mock is always last, and is never skipped.
   *
   * Without it a deployment whose only key has expired serves errors to every
   * student until someone notices. With it they get clearly-labelled
   * placeholder text and the failure is visible in the usage dashboard as a
   * chain that fell all the way through.
   */
  if (!route.some((entry) => entry.providerType === "mock")) {
    route.push({
      providerType: "mock",
      model: "mock-tutor-1",
      provider: new MockTutorProvider(),
    });
  }

  return route;
}

/**
 * The tutor's mock is not the admin module's mock.
 *
 * `MockProvider` reads a course-content prompt and returns a course-content
 * document; handed a tutor prompt it produces a schema-valid answer to the
 * wrong schema, which would fail validation twice and land on the fallback
 * answer. Substituting here rather than changing the admin mock keeps each one
 * good at the single job it has.
 */
function instantiate(type: AiProviderType): AIProvider {
  return type === "mock" ? new MockTutorProvider() : providerFor(type);
}

// ── Execution (§68) ───────────────────────────────────────────────────────

export type RouteOptions = {
  tier: ModelTier;
  temperature: number;
  maxTokens: number;
  topP: number;
  timeoutMs: number;
  jsonSchema?: Record<string, unknown> | null;
  signal?: AbortSignal;
};

/**
 * Run the chain until one provider answers.
 *
 * A non-retryable failure — a rejected key, a model that does not exist — moves
 * straight to the next provider rather than being retried, because retrying it
 * can only fail again (§68 "do not automatically retry expensive providers
 * repeatedly"). A retryable one gets a single backoff *within* the same
 * provider before moving on: most rate limits clear in under a second, and the
 * alternative is falling to a costlier model over a hiccup.
 */
export async function routeStructured(
  messages: ProviderMessage,
  options: RouteOptions
): Promise<RouterResult> {
  const route = buildRoute(options.tier);
  const attempts: RouterAttempt[] = [];

  for (const entry of route) {
    const providerOptions: ProviderOptions = {
      model: entry.model,
      temperature: options.temperature,
      maxTokens: options.maxTokens,
      topP: options.topP,
      timeoutMs: options.timeoutMs,
      jsonSchema: options.jsonSchema ?? null,
      signal: options.signal,
    };

    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const result = await entry.provider.generateStructured(messages, providerOptions);
        return {
          ok: true,
          result,
          providerType: entry.providerType,
          model: entry.model,
          attempts,
        };
      } catch (err) {
        const error =
          err instanceof ProviderError
            ? err
            : new ProviderError("unknown", "The AI provider failed unexpectedly.");

        // A cancelled request is the student navigating away or an operator
        // stopping the job. Falling through the chain would run the whole
        // thing against a caller that is no longer listening.
        if (error.code === "cancelled") {
          return {
            ok: false,
            attempts,
            message: "The request was cancelled.",
            errorCode: "cancelled",
          };
        }

        const lastAttemptForProvider = attempt === 1 || !error.retryable;
        if (lastAttemptForProvider) {
          attempts.push({
            providerType: entry.providerType,
            model: entry.model,
            errorCode: error.code,
            message: error.message,
          });
          break;
        }

        // One short backoff, then the same provider again.
        await sleep(400 + Math.floor(Math.random() * 400));
      }
    }
  }

  return {
    ok: false,
    attempts,
    /**
     * One sentence, with no provider name and no status code in it (§51).
     * The detail is on the interaction record and in the server log.
     */
    message: "The AI tutor is temporarily unavailable. Please try again in a moment.",
    errorCode: attempts.at(-1)?.errorCode ?? "unavailable",
  };
}

/**
 * The same selection, for a streaming call (§77).
 *
 * Returns the *first* usable entry rather than running a chain, because a
 * stream that has already sent bytes to the browser cannot be replaced by
 * another provider's stream halfway through — the client would receive two
 * partial answers concatenated. Falling back mid-stream is handled one level
 * up, by the route restarting the whole answer, and only before the first token
 * has been flushed.
 */
export function streamingRoute(tier: ModelTier): RouteEntry[] {
  return buildRoute(tier).filter((entry) => typeof entry.provider.stream === "function");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * What the router would do, without doing it — for the admin AI settings screen.
 *
 * Exposes the chain but never a key or a base URL. An operator needs to see
 * that their fallback is configured; nobody needs to see the credential, and a
 * settings screen is the one place a leaked one would be read by a browser.
 */
export function describeRoute(tier: ModelTier): {
  providerType: AiProviderType;
  model: string;
  configured: boolean;
}[] {
  return buildRoute(tier).map((entry) => ({
    providerType: entry.providerType,
    model: entry.model,
    configured: entry.provider.isConfigured(),
  }));
}
