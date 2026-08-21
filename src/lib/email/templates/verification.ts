import { escapeHtml, layout } from "@/lib/email/templates/layout";

export const VERIFICATION_SUBJECT = "Verify your email address";

/**
 * Copy for the "confirm your address" mail.
 *
 * The link is repeated as plain text under the button: a good number of mail
 * clients strip or fail to render the styled anchor, and a student who cannot
 * click anything has no other way to finish signing up.
 */
export function verificationEmail(params: {
  name: string;
  verificationUrl: string;
  expiresInMinutes: number;
  productName?: string;
}): { subject: string; html: string; text: string } {
  const product = params.productName ?? "EduPilot";
  const firstName = params.name.trim().split(/\s+/)[0] || "there";
  const expiry = formatMinutes(params.expiresInMinutes);

  const html = layout({
    productName: product,
    previewText: `Confirm your address to finish setting up your ${product} account.`,
    body: `
      <p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#0f172a;">
        Hi ${escapeHtml(firstName)},
      </p>
      <p style="margin:0 0 16px;font-size:15px;line-height:1.65;color:#475569;">
        Welcome to ${escapeHtml(product)}. Please verify your email address to complete
        your account setup.
      </p>
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:26px 0;">
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
      <p style="margin:0 0 16px;font-size:13px;line-height:1.6;color:#64748b;">
        This verification link expires ${escapeHtml(expiry)} after it was sent.
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
    "Please verify your email address to complete your account setup:",
    params.verificationUrl,
    "",
    `This verification link expires ${expiry} after it was sent.`,
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
