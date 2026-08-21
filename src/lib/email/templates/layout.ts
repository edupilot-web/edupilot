/**
 * Shared chrome for outgoing mail.
 *
 * Table layout and inline styles throughout, because that is the subset of
 * HTML that survives Outlook and Gmail — a stylesheet in `<head>` is stripped
 * by both, and flexbox is not supported by either.
 */
export function layout(params: {
  productName: string;
  previewText: string;
  body: string;
  signOff: string;
}): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(params.productName)}</title>
  </head>
  <body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <!-- Shown as the snippet next to the subject in most inboxes, then hidden. -->
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(params.previewText)}</div>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;border:1px solid #e2e8f0;">
            <tr>
              <td style="padding:28px 32px 8px;">
                <span style="font-size:19px;font-weight:700;letter-spacing:-0.02em;color:#152a63;">
                  ${escapeHtml(params.productName)}
                </span>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 32px 28px;">
                ${params.body}
                <p style="margin:24px 0 0;font-size:15px;line-height:1.6;color:#0f172a;">
                  ${params.signOff}
                </p>
              </td>
            </tr>
          </table>

          <p style="max-width:560px;margin:18px auto 0;font-size:11.5px;line-height:1.6;color:#94a3b8;text-align:center;">
            This is an automated message from ${escapeHtml(params.productName)}. Please do not reply to it.
          </p>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

/** Anything interpolated into the HTML above goes through here first. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
