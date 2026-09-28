import {
  ProviderError,
  type ProviderMessage,
  type ProviderOptions,
  type ProviderResult,
} from "@/lib/admin/ai/provider";

/**
 * The Gemini wire format, shared by the two providers that speak it.
 *
 * Google serves the same models through two APIs: the Generative Language API
 * (an API key, `generativelanguage.googleapis.com`) and Vertex AI (an OAuth
 * token, a project and a region). The **request and response bodies are
 * identical** — the same `contents`, `systemInstruction`, `generationConfig`,
 * `candidates`, `finishReason` and `usageMetadata`. Only the URL and the
 * `Authorization` header differ.
 *
 * So the body building, the response reading and the error mapping live here
 * once. The alternative was a second three-hundred-line provider that agreed
 * with this one on every subtle point — `MAX_TOKENS` being a failure rather than
 * a finish, a blocked prompt being non-retryable, a 404 meaning "wrong model
 * name" — until someone changed one of them.
 *
 * Each provider supplies its own `label` so the messages an operator reads name
 * the thing they configured ("Vertex AI rejected the request"), not the wire
 * format underneath it.
 */

export type GeminiResponse = {
  candidates?: {
    content?: { parts?: { text?: string }[] };
    finishReason?: string;
  }[];
  promptFeedback?: { blockReason?: string };
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  };
  error?: { code?: number; message?: string; status?: string };
};

/**
 * What a provider tells the shared code about itself.
 *
 * `credentialHint` is the one thing that must not be generic: "check your
 * credentials" sends an operator to the wrong file, while "check
 * GOOGLE_VERTEX_SERVICE_ACCOUNT_JSON" is the whole diagnosis.
 */
export type GeminiFlavour = {
  /** How this provider is named in messages an operator reads. */
  label: string;
  /** The environment variable to check when the credential is rejected. */
  credentialHint: string;
};

export function buildGeminiBody(
  messages: ProviderMessage,
  options: ProviderOptions,
  structured: boolean
): Record<string, unknown> {
  return {
    systemInstruction: { parts: [{ text: messages.system }] },
    contents: [{ role: "user", parts: [{ text: messages.user }] }],
    generationConfig: {
      temperature: options.temperature,
      topP: options.topP,
      maxOutputTokens: options.maxTokens,
      ...(structured
        ? {
            responseMimeType: "application/json",
            ...(options.jsonSchema ? { responseSchema: options.jsonSchema } : {}),
          }
        : {}),
    },
  };
}

/**
 * Turn a successful HTTP response body into a `ProviderResult`, or throw.
 *
 * Every rejection here is a case where the transport said 200 and the content is
 * still unusable — which is most of the ways a Gemini call goes wrong.
 */
export function readGeminiResponse(
  payload: GeminiResponse | null,
  flavour: GeminiFlavour,
  options: { model: string; maxTokens: number; startedAt: number }
): ProviderResult {
  if (!payload) {
    throw new ProviderError(
      "invalid-response",
      `${flavour.label} returned a response that could not be read.`
    );
  }
  if (payload.error) throw geminiErrorFor(payload.error.code ?? 500, payload, flavour);

  if (payload.promptFeedback?.blockReason) {
    throw new ProviderError(
      "content-filtered",
      `${flavour.label} declined the request (${payload.promptFeedback.blockReason}). Rephrase the instructions or reduce the source material.`,
      { retryable: false }
    );
  }

  const candidate = payload.candidates?.[0];
  const text = candidate?.content?.parts?.map((part) => part.text ?? "").join("") ?? "";

  /**
   * `MAX_TOKENS` is reported as a normal finish, not an error.
   *
   * Treated as a failure here because a truncated academic document is the most
   * dangerous kind of success: the JSON may still parse, the units array is
   * simply short, and a reviewer has no way to see that the model was cut off
   * rather than done.
   */
  if (candidate?.finishReason === "MAX_TOKENS") {
    throw new ProviderError(
      "token-limit",
      `The response hit the ${options.maxTokens.toLocaleString("en-IN")} token limit and was truncated. Generate a single unit at a time, or raise the limit in AI Settings.`,
      { retryable: false }
    );
  }

  if (candidate?.finishReason === "SAFETY" || candidate?.finishReason === "PROHIBITED_CONTENT") {
    throw new ProviderError(
      "content-filtered",
      `${flavour.label} stopped generating for safety reasons. Review the subject material and instructions.`,
      { retryable: false }
    );
  }

  if (!text.trim()) {
    throw new ProviderError(
      "invalid-response",
      `${flavour.label} returned no content${candidate?.finishReason ? ` (finish reason: ${candidate.finishReason})` : ""}.`
    );
  }

  return {
    text,
    usage: {
      promptTokens: payload.usageMetadata?.promptTokenCount ?? 0,
      completionTokens: payload.usageMetadata?.candidatesTokenCount ?? 0,
      totalTokens: payload.usageMetadata?.totalTokenCount ?? 0,
    },
    model: options.model,
    durationMs: Date.now() - options.startedAt,
  };
}

/**
 * Map a transport failure onto the closed error set.
 *
 * The provider's own message is passed through only for the statuses where it is
 * about the *request* (a bad model name, a malformed schema). For 401 and 403 it
 * is replaced: those responses sometimes echo back part of the credential, and
 * §32 forbids surfacing provider secrets.
 */
export function geminiErrorFor(
  status: number,
  payload: GeminiResponse | null,
  flavour: GeminiFlavour
): ProviderError {
  const detail = payload?.error?.message;

  if (status === 400) {
    return new ProviderError(
      "invalid-response",
      `${flavour.label} rejected the request${detail ? `: ${detail}` : "."}`,
      { retryable: false, status }
    );
  }
  if (status === 401 || status === 403) {
    return new ProviderError(
      "unauthorized",
      `${flavour.label} rejected the credential. Check ${flavour.credentialHint} on the server.`,
      { retryable: false, status }
    );
  }
  if (status === 404) {
    return new ProviderError(
      "not-configured",
      `${flavour.label} has no such model${detail ? `: ${detail}` : "."} Change the model in AI Settings.`,
      { retryable: false, status }
    );
  }
  if (status === 429) {
    return new ProviderError(
      "rate-limited",
      `${flavour.label} rate limit reached. The job will be retried.`,
      { status }
    );
  }
  if (status >= 500) {
    return new ProviderError("unavailable", `${flavour.label} is temporarily unavailable.`, {
      status,
    });
  }

  return new ProviderError(
    "unknown",
    `${flavour.label} returned an unexpected status ${status}.`,
    { status }
  );
}

/**
 * One streamed SSE frame, as a delta.
 *
 * Returns `null` for a frame that is not worth acting on. A malformed frame is
 * not worth abandoning a good answer over — the accumulated text is validated at
 * the end regardless — so it is skipped rather than thrown.
 */
export function readGeminiFrame(
  data: string,
  flavour: GeminiFlavour
): { delta: string } | null {
  let chunk: GeminiResponse;
  try {
    chunk = JSON.parse(data) as GeminiResponse;
  } catch {
    return null;
  }

  const candidate = chunk.candidates?.[0];

  // Truncation is as dangerous mid-stream as it is in a single response: the
  // JSON accumulated so far may well parse.
  if (candidate?.finishReason === "MAX_TOKENS") {
    throw new ProviderError(
      "token-limit",
      `${flavour.label} hit the output token limit and the answer was cut off.`,
      { retryable: false }
    );
  }

  const delta = candidate?.content?.parts?.map((part) => part.text ?? "").join("") ?? "";
  return delta ? { delta } : null;
}
