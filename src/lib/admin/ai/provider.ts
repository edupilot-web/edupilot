import type { AiProviderType } from "@/lib/admin/ai/fields";

/**
 * AIProvider — the seam every model sits behind (spec §23).
 *
 * The point of this file is that `generator.ts` never imports a vendor SDK and
 * never reads an API key. It asks a provider for structured JSON and gets back a
 * `ProviderResult`; whether that came from Gemini, a local Ollama or the mock is
 * invisible to it. That is what makes §45's phase 3 a configuration change
 * rather than a rewrite, and it is why the frontend cannot call a model directly
 * (§44) — there is no browser-reachable path to one.
 *
 * Credentials are read from the environment *inside* each provider, at call
 * time. Never from a database document (§22) and never passed in as an argument,
 * because an argument would show up in the job's stored `request`.
 */

export type ProviderMessage = {
  system: string;
  user: string;
};

export type ProviderOptions = {
  model: string;
  temperature: number;
  maxTokens: number;
  topP: number;
  /** Constrains the provider's own output where it supports it (§12). */
  jsonSchema?: Record<string, unknown> | null;
  /** Milliseconds before the call is abandoned (§32 "AI timeout"). */
  timeoutMs: number;
  signal?: AbortSignal;
};

export type TokenUsage = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
};

export type ProviderResult = {
  /** Raw text as returned. Parsing is the caller's job, not the provider's. */
  text: string;
  usage: TokenUsage;
  model: string;
  /** Milliseconds spent in the provider call. */
  durationMs: number;
};

/**
 * Errors a provider may raise, as a closed set.
 *
 * A closed set because §32 requires each of these to become a distinct,
 * user-friendly message, and because the retry policy differs: a rate limit is
 * worth retrying, an invalid key never is.
 */
export type ProviderErrorCode =
  | "not-configured"
  | "unauthorized"
  | "rate-limited"
  | "timeout"
  | "unavailable"
  | "token-limit"
  | "invalid-response"
  | "content-filtered"
  | "cancelled"
  | "unknown";

export class ProviderError extends Error {
  readonly code: ProviderErrorCode;
  /** Whether trying again could plausibly succeed (§19 retry). */
  readonly retryable: boolean;
  /** HTTP status, when the failure came from one. Never a response body. */
  readonly status?: number;

  constructor(
    code: ProviderErrorCode,
    message: string,
    options?: { retryable?: boolean; status?: number }
  ) {
    super(message);
    this.name = "ProviderError";
    this.code = code;
    this.retryable = options?.retryable ?? RETRYABLE.has(code);
    this.status = options?.status;
  }
}

const RETRYABLE = new Set<ProviderErrorCode>([
  "rate-limited",
  "timeout",
  "unavailable",
  "invalid-response",
]);

/**
 * The interface (§23).
 *
 * `generateStructured` is the one the module actually uses; `generate` exists for
 * the assistant's prose turns, and `embed` for §39's retrieval. `stream` and
 * `embed` are optional so a provider that cannot do them declares that by
 * omission rather than by throwing at the worst moment.
 */
export interface AIProvider {
  readonly type: AiProviderType;
  readonly name: string;

  /** Whether this provider has what it needs to run — a key, a reachable host. */
  isConfigured(): boolean;
  /** A cheap round trip, for the settings screen's "Test connection". */
  validate(): Promise<{ ok: boolean; message: string }>;

  /** Free-form text. Used by the assistant (§15). */
  generate(messages: ProviderMessage, options: ProviderOptions): Promise<ProviderResult>;

  /** JSON constrained by a schema where the provider supports it (§12). */
  generateStructured(messages: ProviderMessage, options: ProviderOptions): Promise<ProviderResult>;

  stream?(
    messages: ProviderMessage,
    options: ProviderOptions
  ): AsyncIterable<{ delta: string; done: boolean }>;

  embed?(texts: string[]): Promise<number[][]>;
}

/**
 * Strip a fenced code block if the model wrapped its JSON in one.
 *
 * Shared by every provider because they all do it occasionally, schema mode or
 * not, and each one solving it separately is how one of them ends up not
 * solving it.
 */
export function unfence(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.startsWith("```")) return trimmed;
  return trimmed
    .replace(/^```(?:json|JSON)?\s*\n?/, "")
    .replace(/\n?```\s*$/, "")
    .trim();
}

/**
 * Parse a provider's text as JSON, tolerating a leading or trailing sentence.
 *
 * Deliberately narrow: it unfences, then tries the whole string, then falls back
 * to the outermost brace pair. It does not attempt to repair malformed JSON —
 * a half-parsed academic document is worse than a failed job, because it would
 * be saved and reviewed as if it were complete.
 */
export function parseJsonResponse(text: string): { ok: true; value: unknown } | { ok: false; reason: string } {
  const cleaned = unfence(text);
  if (!cleaned) return { ok: false, reason: "The model returned an empty response." };

  try {
    return { ok: true, value: JSON.parse(cleaned) };
  } catch {
    // Fall through to the brace scan.
  }

  const first = cleaned.indexOf("{");
  const last = cleaned.lastIndexOf("}");
  if (first >= 0 && last > first) {
    try {
      return { ok: true, value: JSON.parse(cleaned.slice(first, last + 1)) };
    } catch {
      // Fall through.
    }
  }

  return {
    ok: false,
    reason: "The model's response was not valid JSON. The full response is stored on the job for inspection.",
  };
}

/**
 * Wrap a fetch with a timeout that also honours an external abort (§32).
 *
 * Two signals rather than one: the job may be cancelled by an operator while the
 * provider's own timeout is still running, and a single `AbortController` cannot
 * distinguish which fired — which matters, because one is a cancellation and the
 * other is a failure.
 */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  options: { timeoutMs: number; signal?: AbortSignal }
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error("timeout")), options.timeoutMs);

  const onExternalAbort = () => controller.abort(new Error("cancelled"));
  options.signal?.addEventListener("abort", onExternalAbort, { once: true });

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch {
    if (options.signal?.aborted) {
      throw new ProviderError("cancelled", "The generation was cancelled.", { retryable: false });
    }
    if (controller.signal.aborted) {
      throw new ProviderError(
        "timeout",
        `The AI provider did not respond within ${Math.round(options.timeoutMs / 1000)} seconds.`
      );
    }
    throw new ProviderError("unavailable", "The AI provider could not be reached.");
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", onExternalAbort);
  }
}
