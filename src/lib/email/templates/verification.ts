import { escapeHtml, layout } from "@/lib/email/templates/layout";

export const VERIFICATION_SUBJECT = "Verify your email address";

/**
 * Copy for the "confirm your address" mail.
 *
 * The code leads, because that is what the screen asks for and it is the one
 * thing that still works when the mail is read on a phone while the sign-up
 * waits on a laptop. The link stays underneath as the one-click path for
 * anyone reading in the same browser — and is repeated as plain text below it,
 * since a good number of clients strip or fail to render a styled anchor.
 */
export function verificationEmail(params: {
  name: string;
  code: string;
  verificationUrl: string;
  expiresInMinutes: number;
  productName?: string;
}): { subject: string; html: string; text: string } {
  const product = params.productName ?? "EduPilot";
  const firstName = params.name.trim().split(/\s+/)[0] || "there";
  const expiry = formatMinutes(params.expiresInMinutes);

  const html = layout({
    productName: product,
    previewText: `Your ${product} verification code is ${params.code}.`,
    body: `
      <p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#0f172a;">
        Hi ${escapeHtml(firstName)},
      </p>
      <p style="margin:0 0 16px;font-size:15px;line-height:1.65;color:#475569;">
        Welcome to ${escapeHtml(product)}. Enter this code on the verification screen to
        confirm your email address:
      </p>
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;">
        <tr>
          <td style="border-radius:12px;border:1px solid #dbeafe;background:#eff6ff;padding:18px 30px;text-align:center;">
            <!-- Monospaced and letter-spaced: the digits have to be unambiguous
                 to read back one at a time from a phone. -->
            <span style="font-family:Consolas,Menlo,monospace;font-size:32px;font-weight:700;letter-spacing:8px;color:#1d4ed8;">${escapeHtml(params.code)}</span>
          </td>
        </tr>
      </table>
      <p style="margin:0 0 24px;font-size:13px;line-height:1.6;color:#64748b;">
        This code expires ${escapeHtml(expiry)} and can only be used once.
      </p>
      <p style="margin:0 0 10px;font-size:14px;line-height:1.6;color:#475569;">
        Reading this in the browser you signed up from? Verify in one click:
      </p>
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 22px;">
        <tr>
          <td style="border-radius:10px;background:#2563eb;">
            <a href="${escapeHtml(params.verificationUrl)}"
               style="display:inline-block;padding:13px 30px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:10px;">
              Verify email
            </a>
          </td>
        </tr>
      </table>
      <p style="margin:0 0 16px;font-size:13px;line-height:1.6;color:#64748b;">
        If the button does not work, copy this link into your browser:<br />
        <a href="${escapeHtml(params.verificationUrl)}" style="color:#2563eb;word-break:break-all;">${escapeHtml(params.verificationUrl)}</a>
      </p>
      <p style="margin:0;font-size:13px;line-height:1.6;color:#64748b;">
        If you did not create this account, you can safely ignore this email.
      </p>
    `,
    signOff: `Thanks,<br />The ${escapeHtml(product)} Team`,
  });

  const text = [
    `Hi ${firstName},`,
    "",
    `Welcome to ${product}.`,
    "",
    "Enter this code on the verification screen to confirm your email address:",
    "",
    `    ${params.code}`,
    "",
    `This code expires ${expiry} and can only be used once.`,
    "",
    "Or, in the browser you signed up from, verify in one click:",
    params.verificationUrl,
    "",
    "If you did not create this account, you can safely ignore this email.",
    "",
    "Thanks,",
    `The ${product} Team`,
  ].join("\n");

  return { subject: VERIFICATION_SUBJECT, html, text };
}

function formatMinutes(minutes: number): string {
  if (minutes < 60) return `in ${minutes} minutes`;
  const hours = Math.round(minutes / 60);
  return `in ${hours} hour${hours === 1 ? "" : "s"}`;
}
