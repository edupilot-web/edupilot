import type { EmailMessage, EmailSendResult, EmailTransport } from "@/lib/email/types";
import { formatAddress } from "@/lib/email/types";

/**
 * Postal (https://docs.postalserver.io) over its HTTP send API.
 *
 * Self-hosted, so there is no vendor account to hold the platform's mail. The
 * server credential is a per-mail-server API key, sent as `X-Server-API-Key`.
 */
const SEND_PATH = "/api/v1/send/message";

/** Postal answers 200 even for failures, with the outcome in the body. */
type PostalResponse = {
  status?: "success" | "parameter-error" | "error";
  data?: {
    message_id?: string;
    messages?: Record<string, { id?: number; token?: string }>;
    code?: string;
    message?: string;
  };
};

function credentials(): { apiUrl: string; apiKey: string } | null {
  const apiUrl = process.env.POSTAL_API_URL?.trim().replace(/\/+$/, "");
  const apiKey = process.env.POSTAL_API_KEY?.trim();
  if (!apiUrl || !apiKey) return null;
  return { apiUrl, apiKey };
}

export const postalTransport: EmailTransport = {
  name: "postal",

  isConfigured() {
    return credentials() !== null;
  },

  async send(message: EmailMessage): Promise<EmailSendResult> {
    const creds = credentials();
    if (!creds) {
      return { ok: false, error: "POSTAL_API_URL and POSTAL_API_KEY are not set" };
    }

    const from = formatAddress({
      email: process.env.EMAIL_FROM?.trim() || "no-reply@localhost",
      name: process.env.EMAIL_FROM_NAME?.trim() || null,
    });

    let response: Response;
    try {
      response = await fetch(`${creds.apiUrl}${SEND_PATH}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Server-API-Key": creds.apiKey,
        },
        body: JSON.stringify({
          to: [formatAddress(message.to)],
          from,
          subject: message.subject,
          html_body: message.html,
          plain_body: message.text,
          ...(message.replyTo ? { reply_to: message.replyTo } : {}),
        }),
        cache: "no-store",
        // A hung mail server must not hold a request open until the platform
        // times it out; the caller can offer "resend" instead.
        signal: AbortSignal.timeout(
          Number(process.env.POSTAL_TIMEOUT_MS ?? 10_000)
        ),
      });
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : "Postal request failed",
      };
    }

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      return {
        ok: false,
        error: `Postal responded ${response.status}: ${detail.slice(0, 300)}`,
      };
    }

    const body = (await response.json().catch(() => null)) as PostalResponse | null;
    if (!body || body.status !== "success") {
      const code = body?.data?.code ?? body?.status ?? "unknown";
      const detail = body?.data?.message ?? "";
      return { ok: false, error: `Postal rejected the message (${code}) ${detail}`.trim() };
    }

    return { ok: true, id: body.data?.message_id ?? null };
  },
};
