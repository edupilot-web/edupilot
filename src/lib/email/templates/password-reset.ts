import { escapeHtml, layout } from "@/lib/email/templates/layout";

export const PASSWORD_RESET_SUBJECT = "Reset your EduPilot password";
export const NO_PASSWORD_SUBJECT = "About your EduPilot sign-in";

/**
 * Copy for the reset link.
 *
 * The link leads, because unlike verification there is no code to type — the
 * link *is* the credential, and anything competing with it for attention is
 * noise.
 *
 * The last paragraph matters more than it looks. A reset mail arriving
 * unrequested is the earliest signal somebody has that their address is being
 * targeted, and "ignore this" tells them what to do without alarming anyone who
 * simply forgot their password.
 */
export function passwordResetEmail(params: {
  name: string;
  resetUrl: string;
  expiresInMinutes: number;
  productName?: string;
}): { subject: string; html: string; text: string } {
  const product = params.productName ?? "EduPilot";
  const firstName = params.name.trim().split(/\s+/)[0] || "there";
  const expiry = formatMinutes(params.expiresInMinutes);

  const html = layout({
    productName: product,
    previewText: `Reset your ${product} password. The link expires in ${expiry}.`,
    body: `
      <p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#0f172a;">
        Hi ${escapeHtml(firstName)},
      </p>
      <p style="margin:0 0 16px;font-size:15px;line-height:1.65;color:#475569;">
        Someone asked to reset the password for your ${escapeHtml(product)} account.
        Choose a new one here:
      </p>
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;">
        <tr>
          <td style="border-radius:10px;background:#2563eb;">
            <a href="${escapeHtml(params.resetUrl)}"
               style="display:inline-block;padding:13px 28px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;">
              Set a new password
            </a>
          </td>
        </tr>
      </table>
      <p style="margin:0 0 8px;font-size:13px;line-height:1.6;color:#64748b;">
        Or paste this into your browser:
      </p>
      <!-- Repeated as plain text: a fair number of clients strip or fail to
           render a styled anchor, and a reset mail with no usable link is a
           support ticket. -->
      <p style="margin:0 0 24px;font-size:12.5px;line-height:1.5;color:#2563eb;word-break:break-all;">
        ${escapeHtml(params.resetUrl)}
      </p>
      <p style="margin:0 0 16px;font-size:13px;line-height:1.6;color:#64748b;">
        The link works once and expires in ${escapeHtml(expiry)}.
      </p>
      <p style="margin:0;font-size:13px;line-height:1.6;color:#64748b;">
        If you did not ask for this, you can ignore this email — your password has not
        changed. Resetting it will also sign you out everywhere, which is worth doing if
        you think someone else has been using your account.
      </p>
    `,
    signOff: `Thanks,<br />The ${escapeHtml(product)} Team`,
  });

  const text = [
    `Hi ${firstName},`,
    "",
    `Someone asked to reset the password for your ${product} account.`,
    "Choose a new one here:",
    params.resetUrl,
    "",
    `The link works once and expires in ${expiry}.`,
    "",
    "If you did not ask for this, you can ignore this email - your password has not changed.",
  ].join("\n");

  return { subject: PASSWORD_RESET_SUBJECT, html, text };
}

/**
 * Sent when the address belongs to a Google account, which has no password.
 *
 * Sent rather than refused at the form, and that is the whole point: the person
 * who typed the address into the form learns nothing either way, while the
 * person who actually holds the mailbox is told why the reset screen cannot help
 * and what to do instead. Refusing at the form would make it a way to discover
 * which addresses are Google accounts.
 */
export function noPasswordEmail(params: {
  name: string;
  productName?: string;
}): { subject: string; html: string; text: string } {
  const product = params.productName ?? "EduPilot";
  const firstName = params.name.trim().split(/\s+/)[0] || "there";

  const html = layout({
    productName: product,
    previewText: `Your ${product} account signs in with Google.`,
    body: `
      <p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#0f172a;">
        Hi ${escapeHtml(firstName)},
      </p>
      <p style="margin:0 0 16px;font-size:15px;line-height:1.65;color:#475569;">
        Someone asked to reset the password for your ${escapeHtml(product)} account — but
        your account signs in with <strong>Google</strong>, so it does not have a password
        for us to reset.
      </p>
      <p style="margin:0 0 16px;font-size:15px;line-height:1.65;color:#475569;">
        Use <strong>Continue with Google</strong> on the sign-in screen. If you have lost
        access to the Google account itself, Google can help you recover it.
      </p>
      <p style="margin:0;font-size:13px;line-height:1.6;color:#64748b;">
        If you did not ask for this, you can ignore this email. Nothing about your account
        has changed.
      </p>
    `,
    signOff: `Thanks,<br />The ${escapeHtml(product)} Team`,
  });

  const text = [
    `Hi ${firstName},`,
    "",
    `Someone asked to reset the password for your ${product} account, but your account`,
    "signs in with Google and does not have a password for us to reset.",
    "",
    'Use "Continue with Google" on the sign-in screen.',
    "",
    "If you did not ask for this, you can ignore this email.",
  ].join("\n");

  return { subject: NO_PASSWORD_SUBJECT, html, text };
}

function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} minutes`;
  const hours = Math.round(minutes / 60);
  return hours === 1 ? "1 hour" : `${hours} hours`;
}
