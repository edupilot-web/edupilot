import type { EmailMessage, EmailSendResult, EmailTransport } from "@/lib/email/types";

/**
 * Development transport: prints the message — and, crucially, the code and link
 * inside it — to the server log instead of delivering it.
 *
 * This is what makes a fresh clone usable before anyone has a Brevo API key.
 * It refuses to be the transport in production, where silently
 * swallowing verification mail would strand every new account.
 */
export const consoleTransport: EmailTransport = {
  name: "console",

  isConfigured() {
    return process.env.NODE_ENV !== "production";
  },

  async send(message: EmailMessage): Promise<EmailSendResult> {
    if (process.env.NODE_ENV === "production") {
      return { ok: false, error: "The console transport is not usable in production" };
    }

    // The plain-text alternative, in full, rather than a scrape for links. Every
    // template writes one and it holds whatever the recipient actually needs —
    // the verification code as well as the URL — so this stays useful as new
    // kinds of mail are added.
    const body = message.text
      .split("\n")
      .map((line) => `  ${line}`)
      .join("\n");

    console.info(
      [
        "",
        "──────── email (console transport, nothing was sent) ────────",
        `To:      ${message.to.name ? `${message.to.name} <${message.to.email}>` : message.to.email}`,
        `Subject: ${message.subject}`,
        "─────────────────────────────────────────────────────────────",
        body,
        "─────────────────────────────────────────────────────────────",
        "",
      ].join("\n")
    );

    return { ok: true, id: null };
  },
};
