import {
  ProviderError,
  fetchWithTimeout,
  type AIProvider,
  type ProviderMessage,
  type ProviderOptions,
  type ProviderResult,
} from "@/lib/admin/ai/provider";
import type { AiProviderType } from "@/lib/admin/ai/fields";

/**
 * One provider class for every service that speaks `/v1/chat/completions`.
 *
 * DeepSeek, Groq, OpenAI and a self-hosted vLLM all expose the same request and
 * response shape; the only differences are the base URL, the environment
 * variable holding the key, and the default model. Three near-identical classes
 * would be three places to fix the next parsing quirk, and the third would be
 * missed — so the variation is *data* (`OPENAI_COMPATIBLE_SERVICES` below) and
 * the behaviour is written once.
 *
 * As with Gemini, the key is read from `process.env` at call time: never cached
 * in a module variable, and never read from the provider-config document, which
 * the settings screen returns to a browser.
 */

export type OpenAICompatibleService = {
  type: AiProviderType;
  name: string;
  baseUrl: string;
  /** Checked in order, so a deployment can share one key across two services. */
  keyEnv: string[];
  defaultModel: string;
  /** Overridable per deployment, for a proxy or a regional endpoint. */
  baseUrlEnv?: string;
};

export const OPENAI_COMPATIBLE_SERVICES: Record<string, OpenAICompatibleService> = {
  deepseek: {
    type: "deepseek",
    name: "DeepSeek",
    baseUrl: "https://api.deepseek.com/v1",
    baseUrlEnv: "DEEPSEEK_BASE_URL",
    keyEnv: ["DEEPSEEK_API_KEY"],
    defaultModel: "deepseek-chat",
  },
  groq: {
    type: "groq",
    name: "Groq",
    baseUrl: "https://api.groq.com/openai/v1",
    baseUrlEnv: "GROQ_BASE_URL",
    keyEnv: ["GROQ_API_KEY"],
    defaultModel: "llama-3.3-70b-versatile",
  },
  openai: {
    type: "openai",
    name: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    baseUrlEnv: "OPENAI_BASE_URL",
    keyEnv: ["OPENAI_API_KEY"],
    defaultModel: "gpt-5.4-mini",
  },
  /**
   * The escape hatch: anything else that speaks the same protocol.
   *
   * Its base URL is required from the environment rather than defaulted,
   * because a wrong default here would send prompts to someone else's server.
   */
  "openai-compatible": {
    type: "openai-compatible",
    name: "OpenAI-compatible",
    baseUrl: "",
    baseUrlEnv: "OPENAI_COMPATIBLE_BASE_URL",
    keyEnv: ["OPENAI_COMPATIBLE_API_KEY"],
    defaultModel: "",
  },
};

type ChatResponse = {
  choices?: {
    message?: { content?: string | null };
    finish_reason?: string | null;
  }[];
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  error?: { message?: string; type?: string; code?: string };
};

type StreamChunk = {
  choices?: { delta?: { content?: string | null }; finish_reason?: string | null }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
};

export class OpenAICompatibleProvider implements AIProvider {
  readonly type: AiProviderType;
  readonly name: string;

  constructor(private readonly service: OpenAICompatibleService) {
    this.type = service.type;
    this.name = service.name;
  }

  private key(): string | null {
    for (const name of this.service.keyEnv) {
      const value = process.env[name]?.trim();
      if (value) return value;
    }
    return null;
  }

  private baseUrl(): string {
    const override = this.service.baseUrlEnv
      ? process.env[this.service.baseUrlEnv]?.trim()
      : null;
    // A trailing slash turns `${base}/chat/completions` into a double slash,
    // which some gateways answer with a 404 that looks like a wrong model name.
    return (override || this.service.baseUrl).replace(/\/+$/, "");
  }

  isConfigured(): boolean {
    return Boolean(this.key()) && Boolean(this.baseUrl());
  }

  async validate(): Promise<{ ok: boolean; message: string }> {
    if (!this.baseUrl()) {
      return {
        ok: false,
        message: `${this.service.baseUrlEnv} is not set. This provider has no default endpoint.`,
      };
    }
    if (!this.key()) {
      return {
        ok: false,
        message: `${this.service.keyEnv[0]} is not set. Add it to the environment — it is never stored in the database.`,
      };
    }

    try {
      await this.call(
        { system: "Reply with the single word OK.", user: "OK" },
        {
          model: this.service.defaultModel,
          temperature: 0,
          maxTokens: 16,
          topP: 1,
          timeoutMs: 15_000,
        },
        false
      );
      return { ok: true, message: `${this.name} responded successfully.` };
    } catch (err) {
      return {
        ok: false,
        message: err instanceof ProviderError ? err.message : `${this.name} could not be reached.`,
      };
    }
  }

  async generate(messages: ProviderMessage, options: ProviderOptions): Promise<ProviderResult> {
    return this.call(messages, options, false);
  }

  /**
   * Structured output via `response_format: json_object`.
   *
   * Not `json_schema`: support for it varies between these services and between
   * models within one of them, and a request that names an unsupported format
   * is rejected outright rather than degraded. `json_object` is universally
   * accepted, and the shape is enforced by zod on the way back regardless —
   * which is the layer that has to be right in any case (§64).
   */
  async generateStructured(
    messages: ProviderMessage,
    options: ProviderOptions
  ): Promise<ProviderResult> {
    return this.call(messages, options, true);
  }

  private body(
    messages: ProviderMessage,
    options: ProviderOptions,
    structured: boolean,
    stream: boolean
  ): Record<string, unknown> {
    return {
      model: options.model || this.service.defaultModel,
      messages: [
        { role: "system", content: messages.system },
        { role: "user", content: messages.user },
      ],
      temperature: options.temperature,
      top_p: options.topP,
      max_tokens: options.maxTokens,
      ...(structured ? { response_format: { type: "json_object" } } : {}),
      ...(stream ? { stream: true, stream_options: { include_usage: true } } : {}),
    };
  }

  private async call(
    messages: ProviderMessage,
    options: ProviderOptions,
    structured: boolean
  ): Promise<ProviderResult> {
    const key = this.key();
    const base = this.baseUrl();

    if (!base || !key) {
      throw new ProviderError(
        "not-configured",
        `${this.name} is not configured on the server.`,
        { retryable: false }
      );
    }

    const model = options.model || this.service.defaultModel;
    const started = Date.now();

    const response = await fetchWithTimeout(
      `${base}/chat/completions`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify(this.body(messages, options, structured, false)),
      },
      { timeoutMs: options.timeoutMs, signal: options.signal }
    );

    const payload = (await response.json().catch(() => null)) as ChatResponse | null;

    if (!response.ok) throw this.errorFor(response.status, payload);
    if (!payload) {
      throw new ProviderError(
        "invalid-response",
        `${this.name} returned a response that could not be read.`
      );
    }

    const choice = payload.choices?.[0];
    const text = choice?.message?.content ?? "";

    /**
     * `length` is this protocol's `MAX_TOKENS`, and it arrives as a *successful*
     * response — the same trap Gemini sets. Treated as a failure for the same
     * reason: truncated JSON that still parses is worse than no answer, because
     * nothing downstream can tell it was cut off.
     */
    if (choice?.finish_reason === "length") {
      throw new ProviderError(
        "token-limit",
        `The response hit the ${options.maxTokens.toLocaleString("en-IN")} token limit and was truncated.`,
        { retryable: false }
      );
    }
    if (choice?.finish_reason === "content_filter") {
      throw new ProviderError(
        "content-filtered",
        `${this.name} stopped generating for safety reasons.`,
        { retryable: false }
      );
    }
    if (!text.trim()) {
      throw new ProviderError("invalid-response", `${this.name} returned no content.`);
    }

    return {
      text,
      usage: {
        promptTokens: payload.usage?.prompt_tokens ?? 0,
        completionTokens: payload.usage?.completion_tokens ?? 0,
        totalTokens:
          payload.usage?.total_tokens ??
          (payload.usage?.prompt_tokens ?? 0) + (payload.usage?.completion_tokens ?? 0),
      },
      model,
      durationMs: Date.now() - started,
    };
  }

  /**
   * Server-sent events, for §77's progressive answer.
   *
   * Yields deltas and nothing else — assembling them, validating the result and
   * storing it is the caller's job. A provider that also parsed the accumulated
   * JSON would have to know what shape the caller wanted, which is exactly the
   * coupling this interface exists to prevent.
   */
  async *stream(
    messages: ProviderMessage,
    options: ProviderOptions
  ): AsyncIterable<{ delta: string; done: boolean }> {
    const key = this.key();
    const base = this.baseUrl();

    if (!base || !key) {
      throw new ProviderError("not-configured", `${this.name} is not configured on the server.`, {
        retryable: false,
      });
    }

    const response = await fetchWithTimeout(
      `${base}/chat/completions`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
          Accept: "text/event-stream",
        },
        body: JSON.stringify(this.body(messages, options, true, true)),
      },
      { timeoutMs: options.timeoutMs, signal: options.signal }
    );

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as ChatResponse | null;
      throw this.errorFor(response.status, payload);
    }
    if (!response.body) {
      throw new ProviderError("invalid-response", `${this.name} returned an empty stream.`);
    }

    for await (const data of readSseData(response.body)) {
      if (data === "[DONE]") {
        yield { delta: "", done: true };
        return;
      }

      let chunk: StreamChunk;
      try {
        chunk = JSON.parse(data) as StreamChunk;
      } catch {
        // A malformed frame mid-stream is not worth abandoning a good answer
        // over; the accumulated text is validated at the end regardless.
        continue;
      }

      const delta = chunk.choices?.[0]?.delta?.content;
      if (delta) yield { delta, done: false };
    }

    yield { delta: "", done: true };
  }

  private errorFor(status: number, payload: ChatResponse | null): ProviderError {
    const detail = payload?.error?.message;

    if (status === 400) {
      return new ProviderError(
        "invalid-response",
        `${this.name} rejected the request${detail ? `: ${detail}` : "."}`,
        { retryable: false, status }
      );
    }
    // The message is replaced rather than passed through: these responses
    // sometimes echo part of the credential back.
    if (status === 401 || status === 403) {
      return new ProviderError(
        "unauthorized",
        `${this.name} rejected the API key. Check ${this.service.keyEnv[0]} on the server.`,
        { retryable: false, status }
      );
    }
    if (status === 404) {
      return new ProviderError(
        "not-configured",
        `${this.name} has no such model or endpoint${detail ? `: ${detail}` : "."}`,
        { retryable: false, status }
      );
    }
    if (status === 429) {
      return new ProviderError("rate-limited", `${this.name} rate limit reached.`, { status });
    }
    if (status >= 500) {
      return new ProviderError("unavailable", `${this.name} is temporarily unavailable.`, {
        status,
      });
    }

    return new ProviderError("unknown", `${this.name} returned an unexpected status ${status}.`, {
      status,
    });
  }
}

/**
 * Pull `data:` payloads out of an SSE body.
 *
 * Its own function because both this provider and Gemini's streaming path need
 * it, and because the part that is easy to get wrong is the same in both: a
 * chunk boundary can fall inside a frame, so the buffer must be carried across
 * reads rather than parsed per chunk.
 */
export async function* readSseData(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      let boundary = buffer.indexOf("\n\n");
      while (boundary !== -1) {
        const frame = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);

        for (const line of frame.split("\n")) {
          const trimmed = line.trim();
          if (trimmed.startsWith("data:")) yield trimmed.slice(5).trim();
        }

        boundary = buffer.indexOf("\n\n");
      }
    }
  } finally {
    reader.releaseLock();
  }
}
