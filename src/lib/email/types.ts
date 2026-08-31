/**
 * The contract between the application and whatever actually delivers mail.
 *
 * Nothing above this file knows that Brevo exists: swapping in Resend, SES or
 * Postmark means adding one module that satisfies `EmailTransport` and naming
 * it in `EMAIL_TRANSPORT`, with no change to the authentication flow.
 */
export type EmailAddress = {
  email: string;
  name?: string | null;
};

export type EmailMessage = {
  to: EmailAddress;
  subject: string;
  html: string;
  /** Plain-text alternative. Always sent — some clients show nothing else. */
  text: string;
  /** Where a reply should go, when that is not the sending address. */
  replyTo?: string;
};

export type EmailSendResult =
  | { ok: true; id: string | null }
  | { ok: false; error: string };

export type EmailTransport = {
  /** Name used in logs and in the "not configured" diagnostics. */
  readonly name: string;
  /** False when the transport is missing credentials and cannot be used. */
  isConfigured(): boolean;
  send(message: EmailMessage): Promise<EmailSendResult>;
};

/** Renders `Name <address@example.com>`, or the bare address when unnamed. */
export function formatAddress(address: EmailAddress): string {
  const name = address.name?.trim();
  if (!name) return address.email;
  // Quote the display name: a comma or angle bracket in it would otherwise
  // change how the header parses.
  return `"${name.replace(/"/g, "")}" <${address.email}>`;
}
