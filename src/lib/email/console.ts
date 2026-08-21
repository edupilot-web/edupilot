import type { EmailMessage, EmailSendResult, EmailTransport } from "@/lib/email/types";

/**
 * Development transport: prints the message — and, crucially, the link inside
 * it — to the server log instead of delivering it.
 *
 * This is what makes a fresh clone usable before anyone has stood up a Postal
 * server. It refuses to be the transport in production, where silently
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

    const links = [...message.html.matchAll(/href="([^"]+)"/g)].map((match) => match[1]);

    console.info(
      [
        "",
        "──────── email (console transport, nothing was sent) ────────",
        `To:      ${message.to.name ? `${message.to.name} <${message.to.email}>` : message.to.email}`,
        `Subject: ${message.subject}`,
        ...links.map((link) => `Link:    ${link}`),
        "─────────────────────────────────────────────────────────────",
        "",
      ].join("\n")
    );

    return { ok: true, id: null };
  },
};
