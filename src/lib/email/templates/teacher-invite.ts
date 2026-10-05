import { escapeHtml, layout } from "@/lib/email/templates/layout";

export const TEACHER_INVITE_SUBJECT_PREFIX = "You have been invited to teach on EduPilot";

/**
 * The invitation to create a teacher account.
 *
 * Unlike a password reset, this arrives at an address that has never heard of
 * the product, from a person the recipient does know. So the college and the
 * administrator who sent it lead: the first question somebody asks about an
 * unexpected link is "who is this from", and an answer they can check against
 * their own institution is what makes the link safe to click.
 *
 * The last paragraph is the counterpart of the reset mail's "ignore this". An
 * invitation nobody asked for is also the first sign an address is being
 * targeted, and an unspent link is harmless — but only if the recipient knows
 * that, and knows who to tell.
 */
export function teacherInviteEmail(params: {
  collegeName: string;
  invitedByName: string;
  inviteUrl: string;
  expiresInDays: number;
  /** "Assistant Professor" and the like, when the administrator named one. */
  designation?: string | null;
  productName?: string;
}): { subject: string; html: string; text: string } {
  const product = params.productName ?? "EduPilot";
  const college = params.collegeName;
  const expiry = params.expiresInDays === 1 ? "1 day" : `${params.expiresInDays} days`;
  const subject = `${TEACHER_INVITE_SUBJECT_PREFIX} for ${college}`;

  const role = params.designation?.trim()
    ? ` as <strong>${escapeHtml(params.designation.trim())}</strong>`
    : "";

  const html = layout({
    productName: product,
    previewText: `${college} has invited you to teach on ${product}. The link expires in ${expiry}.`,
    body: `
      <p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#0f172a;">
        Hello,
      </p>
      <p style="margin:0 0 16px;font-size:15px;line-height:1.65;color:#475569;">
        <strong>${escapeHtml(params.invitedByName)}</strong> at
        <strong>${escapeHtml(college)}</strong> has invited you to teach on
        ${escapeHtml(product)}${role}.
      </p>
      <p style="margin:0 0 16px;font-size:15px;line-height:1.65;color:#475569;">
        ${escapeHtml(product)} is where ${escapeHtml(college)} sets assignments and shares
        notes with its students. You publish to a subject and we work out which students
        receive it &mdash; there is no class list to keep up to date.
      </p>
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;">
        <tr>
          <td style="border-radius:10px;background:#2563eb;">
            <a href="${escapeHtml(params.inviteUrl)}"
               style="display:inline-block;padding:13px 28px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;">
              Create your teacher account
            </a>
          </td>
        </tr>
      </table>
      <p style="margin:0 0 8px;font-size:13px;line-height:1.6;color:#64748b;">
        Or paste this into your browser:
      </p>
      <!-- Repeated as plain text: a fair number of clients strip or fail to
           render a styled anchor, and an invitation with no usable link is a
           message the recipient cannot act on at all. -->
      <p style="margin:0 0 24px;font-size:12.5px;line-height:1.5;color:#2563eb;word-break:break-all;">
        ${escapeHtml(params.inviteUrl)}
      </p>
      <p style="margin:0 0 16px;font-size:13px;line-height:1.6;color:#64748b;">
        The link works once, expires in ${escapeHtml(expiry)}, and only works for this
        email address. Your account is active as soon as you create it; publishing to
        students opens up once ${escapeHtml(college)} approves you.
      </p>
      <p style="margin:0;font-size:13px;line-height:1.6;color:#64748b;">
        If you were not expecting this, you can ignore this email &mdash; nothing happens
        until someone uses the link, and nobody else can use it. If it keeps arriving,
        tell ${escapeHtml(college)}.
      </p>
    `,
    signOff: `Thanks,<br />The ${escapeHtml(product)} Team`,
  });

  const designationLine = params.designation?.trim()
    ? ` as ${params.designation.trim()}`
    : "";

  const text = [
    "Hello,",
    "",
    `${params.invitedByName} at ${college} has invited you to teach on ${product}${designationLine}.`,
    "",
    `${product} is where ${college} sets assignments and shares notes with its students.`,
    "You publish to a subject and we work out which students receive it.",
    "",
    "Create your teacher account here:",
    params.inviteUrl,
    "",
    `The link works once, expires in ${expiry}, and only works for this email address.`,
    `Publishing to students opens up once ${college} approves you.`,
    "",
    "If you were not expecting this, you can ignore this email - nobody else can use the link.",
  ].join("\n");

  return { subject, html, text };
}
