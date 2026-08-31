import { consoleTransport } from "@/lib/email/console";
import { brevoTransport } from "@/lib/email/brevo";
import { verificationEmail } from "@/lib/email/templates/verification";
import type { EmailMessage, EmailSendResult, EmailTransport } from "@/lib/email/types";

/**
 * The only email entry point the rest of the application uses.
 *
 * Callers ask for "a verification email"; they never build a message, name a
 * provider, or see an API key. Brevo is the default implementation behind
 * this, and replacing it is a matter of adding a transport to the registry
 * below — the authentication code does not change.
 */
const TRANSPORTS: Record<string, EmailTransport> = {
  brevo: brevoTransport,
  console: consoleTransport,
};

export const DEFAULT_VERIFICATION_TTL_MINUTES = 60;

/** Minutes a verification link stays valid, from `EMAIL_VERIFICATION_TTL_MINUTES`. */
export function verificationTtlMinutes(): number {
  const raw = Number(process.env.EMAIL_VERIFICATION_TTL_MINUTES);
  if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_VERIFICATION_TTL_MINUTES;
  // Anything beyond a day is a link that outlives the intent behind it.
  return Math.min(Math.round(raw), 60 * 24);
}

/**
 * Picks the transport.
 *
 * `EMAIL_TRANSPORT` wins when set. Otherwise Brevo is used if it has
 * credentials, and development falls back to logging the message so a fresh
 * clone can complete a sign-up without a mail server.
 */
export function activeTransport(): EmailTransport {
  const requested = process.env.EMAIL_TRANSPORT?.trim().toLowerCase();
  if (requested) {
    const transport = TRANSPORTS[requested];
    if (!transport) {
      throw new Error(
        `Unknown EMAIL_TRANSPORT "${requested}". Expected one of: ${Object.keys(TRANSPORTS).join(", ")}.`
      );
    }
    return transport;
  }

  if (brevoTransport.isConfigured()) return brevoTransport;
  return consoleTransport;
}

/** Whether mail can actually leave the building right now. */
export function isEmailConfigured(): boolean {
  try {
    return activeTransport().isConfigured();
  } catch {
    return false;
  }
}

async function send(message: EmailMessage): Promise<EmailSendResult> {
  let transport: EmailTransport;
  try {
    transport = activeTransport();
  } catch (err) {
    const error = err instanceof Error ? err.message : "Email transport is misconfigured";
    console.error("[email]", error);
    return { ok: false, error };
  }

  if (!transport.isConfigured()) {
    const error = `Email transport "${transport.name}" is not configured`;
    console.error("[email]", error);
    return { ok: false, error };
  }

  const result = await transport.send(message);
  if (!result.ok) {
    // The reason is for the operator. Callers turn a failure into "we could not
    // send that email, try again" — never into the provider's own words.
    console.error(`[email] ${transport.name} could not send "${message.subject}":`, result.error);
  }
  return result;
}

/**
 * Sends the "confirm your address" mail — code and link both.
 *
 * Resolves with `{ ok: false }` rather than throwing: a delivery failure must
 * not undo an account that was already created, and the caller's answer to it
 * is to offer "resend", not to roll back.
 */
export async function sendVerificationEmail(params: {
  email: string;
  name: string;
  /** The 6-digit code the student types on the verification screen. */
  code: string;
  verificationUrl: string;
  expiresInMinutes?: number;
}): Promise<EmailSendResult> {
  const { subject, html, text } = verificationEmail({
    name: params.name,
    code: params.code,
    verificationUrl: params.verificationUrl,
    expiresInMinutes: params.expiresInMinutes ?? verificationTtlMinutes(),
  });

  return send({
    to: { email: params.email, name: params.name },
    subject,
    html,
    text,
  });
}
