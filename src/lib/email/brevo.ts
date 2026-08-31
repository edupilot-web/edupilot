import type { EmailMessage, EmailSendResult, EmailTransport } from "@/lib/email/types";

/**
 * Brevo (https://developers.brevo.com) over its transactional email API.
 *
 * One API key is all it needs; the sending address must be a sender Brevo has
 * verified, either a validated single sender or an address on an authenticated
 * domain.
 */
const SEND_URL = "https://api.brevo.com/v3/smtp/email";

type BrevoResponse = {
  messageId?: string;
  messageIds?: string[];
  /** Present on failures: Brevo's own error code, e.g. `unauthorized`. */
  code?: string;
  message?: string;
};

function apiKey(): string | null {
  return process.env.BREVO_API_KEY?.trim() || null;
}

/**
 * The From address. `BREVO_FROM_EMAIL`/`BREVO_FROM_NAME` are what Brevo's own
 * dashboard calls these, and the transport-neutral `EMAIL_FROM` pair still
 * works so an existing deployment does not have to rename anything.
 */
function sender(): { email: string; name?: string } {
  const email =
    process.env.BREVO_FROM_EMAIL?.trim() ||
    process.env.EMAIL_FROM?.trim() ||
    "no-reply@localhost";
  const name = process.env.BREVO_FROM_NAME?.trim() || process.env.EMAIL_FROM_NAME?.trim();
  return name ? { email, name } : { email };
}

export const brevoTransport: EmailTransport = {
  name: "brevo",

  isConfigured() {
    return apiKey() !== null;
  },

  async send(message: EmailMessage): Promise<EmailSendResult> {
    const key = apiKey();
    if (!key) {
      return { ok: false, error: "BREVO_API_KEY is not set" };
    }

    let response: Response;
    try {
      response = await fetch(SEND_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "api-key": key,
        },
        body: JSON.stringify({
          sender: sender(),
          to: [
            message.to.name?.trim()
              ? { email: message.to.email, name: message.to.name.trim() }
              : { email: message.to.email },
          ],
          subject: message.subject,
          htmlContent: message.html,
          textContent: message.text,
          ...(message.replyTo ? { replyTo: { email: message.replyTo } } : {}),
        }),
        cache: "no-store",
        // A hung mail API must not hold a request open until the platform
        // times it out; the caller can offer "resend" instead.
        signal: AbortSignal.timeout(Number(process.env.BREVO_TIMEOUT_MS ?? 10_000)),
      });
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : "Brevo request failed",
      };
    }

    const body = (await response.json().catch(() => null)) as BrevoResponse | null;

    if (!response.ok) {
      // Brevo reports failures with the HTTP status, and names the reason in
      // the body. Both go to the operator's log, never to the end user.
      const code = body?.code ?? "unknown";
      const detail = body?.message ?? "";
      return {
        ok: false,
        error: `Brevo responded ${response.status} (${code}) ${detail}`.trim(),
      };
    }

    return { ok: true, id: body?.messageId ?? body?.messageIds?.[0] ?? null };
  },
};
