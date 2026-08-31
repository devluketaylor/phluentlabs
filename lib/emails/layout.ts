// Shared, email-client-safe HTML layout for transactional emails.
// Table-based, inline styles only (Gmail/Outlook strip <style> + classes).
// Coral accent #ff5c5c is brand-safe on light + dark clients.

const CORAL = "#ff5c5c";
const BRAND = "PhluentLabs";

type EmailLayoutOpts = {
    /** Preheader text shown in the inbox preview (hidden in the body). */
    preheader?: string;
    /** Main body HTML (already-escaped/trusted content). */
    body: string;
    /** Optional footer HTML appended below the divider (e.g. unsubscribe). */
    footer?: string;
};

/**
 * Wraps body content in a branded, responsive, dark-mode-safe email shell.
 *
 * Strategy (genuinely dark-mode-safe, not just a meta tag):
 *  - Inline LIGHT styles remain the DEFAULT fallback. Clients that strip
 *    <style>/classes (Gmail) render the good light design as-is.
 *  - A <head> <style> block with `@media (prefers-color-scheme: dark)` uses
 *    `!important` overrides keyed on classes attached to every important
 *    element (.email-canvas/.email-card/.email-wordmark/.email-body/
 *    .email-footer/.email-copyright/.email-link/.email-muted/.email-divider).
 *    Apple Mail / iOS Mail (the client in the reported screenshot) honor
 *    prefers-color-scheme inside a head <style>, so this actually fixes them.
 *  - The `color-scheme` + `supported-color-schemes` meta tags stay to opt the
 *    document into dark rendering.
 *
 * Light mode is intentionally UNCHANGED — only dark clients see overrides.
 */
export function renderEmailLayout({ preheader, body, footer }: EmailLayoutOpts): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="color-scheme" content="light dark" />
<meta name="supported-color-schemes" content="light dark" />
<title>${BRAND}</title>
<style>
  /* Dark-mode overrides for clients that honor prefers-color-scheme in a
     head <style> (Apple Mail, iOS Mail). Inline light styles above are the
     default for clients that strip this block (Gmail). */
  @media (prefers-color-scheme: dark) {
    .email-canvas { background-color: #0b0b0f !important; }
    .email-card {
      background-color: #18181b !important;
      border-color: #2a2a30 !important;
    }
    .email-header { border-bottom-color: #2a2a30 !important; }
    .email-wordmark { color: #fafafa !important; }
    .email-body { color: #e4e4e7 !important; }
    .email-footer {
      border-top-color: #2a2a30 !important;
      color: #b4b4bb !important;
    }
    .email-copyright { color: #b4b4bb !important; }
    .email-muted { color: #a1a1aa !important; }
    /* Long confirm/share URLs: brighter, readable link on dark (not dim coral). */
    .email-link { color: #ff8a8a !important; }
    .email-footer a { color: #cfcfd6 !important; }
  }
</style>
</head>
<body class="email-canvas" style="margin:0;padding:0;background-color:#f4f4f5;">
${preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${preheader}</div>` : ""}
<table role="presentation" class="email-canvas" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f4f5;">
  <tr>
    <td align="center" style="padding:32px 16px;">
      <table role="presentation" class="email-card" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;background-color:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e4e4e7;">
        <tr>
          <td class="email-header" style="padding:28px 32px 20px 32px;border-bottom:1px solid #f0f0f0;">
            <span class="email-wordmark" style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:20px;font-weight:700;color:#18181b;letter-spacing:-0.02em;">
              Phluent<span style="color:${CORAL};">Labs</span>
            </span>
          </td>
        </tr>
        <tr>
          <td class="email-body" style="padding:28px 32px 32px 32px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:16px;line-height:1.6;color:#3f3f46;">
            ${body}
          </td>
        </tr>
        ${footer ? `<tr>
          <td class="email-footer" style="padding:20px 32px;border-top:1px solid #f0f0f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;line-height:1.5;color:#a1a1aa;">
            ${footer}
          </td>
        </tr>` : ""}
      </table>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;">
        <tr>
          <td align="center" class="email-copyright" style="padding:16px 32px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;color:#a1a1aa;">
            &copy; ${new Date().getFullYear()} ${BRAND}
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

/**
 * Renders a prominent, email-client-safe CTA button (bulletproof VML-free
 * anchor with padding fallback that works across Gmail/Apple Mail/Outlook.com).
 */
export function renderButton(href: string, label: string): string {
    return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0;">
  <tr>
    <td align="center" bgcolor="${CORAL}" style="border-radius:8px;">
      <a href="${href}" target="_blank" style="display:inline-block;padding:13px 28px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">
        ${label}
      </a>
    </td>
  </tr>
</table>`;
}

export const BRAND_NAME = BRAND;
export const BRAND_CORAL = CORAL;
