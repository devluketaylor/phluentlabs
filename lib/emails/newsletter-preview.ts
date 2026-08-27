// Builds the exact HTML a recipient receives for a newsletter issue, for
// use in the admin "Email preview" pane. This MUST mirror the send path in
// `lib/send-newsletter.ts` so the preview is faithful to the real email.
//
// NOTE (kept intentionally in sync): `send-newsletter.ts` currently appends a
// bare unsubscribe footer to the raw newsletter body — it does NOT wrap the
// body in the branded `renderEmailLayout` shell used by transactional/confirm
// emails. This preview matches that current behavior. If the send path is ever
// upgraded to use `renderEmailLayout`, update this builder to match.

type NewsletterPreviewInput = {
    html: string;
    /** Sample unsubscribe URL shown in the footer (real sends mint a signed token per recipient). */
    unsubscribeUrl?: string;
};

/**
 * Returns a full, standalone HTML document string suitable for rendering in a
 * sandboxed iframe. Body + unsubscribe footer mirror the real send output; the
 * surrounding <html>/<body> wrapper (background, base font, safe margins) mimics
 * how an email client frames the message so the preview reads like an inbox.
 */
export function renderNewsletterEmailPreview({
    html,
    unsubscribeUrl = "#unsubscribe",
}: NewsletterPreviewInput): string {
    // This inner markup is exactly what `send-newsletter.ts` puts in `html`.
    const emailBody = `${html}<p style="margin-top:32px;font-size:12px;color:#888;">
    <a href="${unsubscribeUrl}">Unsubscribe</a>
</p>`;

    // Email-client-like frame: neutral background, safe base font, centered
    // reading column. Inline styles only (no external CSS) so the iframe render
    // approximates a real client that strips <style>/classes.
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="color-scheme" content="light" />
<base target="_blank" />
</head>
<body style="margin:0;padding:24px 12px;background-color:#f4f4f5;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f4f5;">
  <tr>
    <td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background-color:#ffffff;border-radius:12px;border:1px solid #e4e4e7;">
        <tr>
          <td style="padding:28px 32px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:16px;line-height:1.6;color:#3f3f46;">
            ${emailBody}
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}
