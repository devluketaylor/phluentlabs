import { renderEmailLayout, renderButton, BRAND_NAME } from "@/lib/emails/layout";
import { ROLE_LABELS, type AdminRole } from "@/lib/roles";

export const TEAM_INVITE_SUBJECT = `You've been invited to the ${BRAND_NAME} admin`;

/**
 * Branded team-invite email (HTML + plaintext) sent when an owner/admin invites
 * a new member. Reuses the shared `renderEmailLayout` shell so it matches the
 * rest of the transactional email suite (coral accent, dark-mode-safe).
 *
 * A temporary password is intentionally shown in PLAINTEXT here — this is a
 * temp-password invite flow, and the member is FORCED to change it on first
 * login (server-gated), so the credential is short-lived by design.
 *
 * - `name`        — the invited member's display name (greeting).
 * - `email`       — their login email (echoed so they know which address to use).
 * - `tempPassword`— the generated temporary password (plaintext, one-time).
 * - `role`        — the admin role they were granted.
 * - `loginUrl`    — link to the sign-in page.
 * - `invitedBy`   — optional inviter email/name for context.
 */
export function renderTeamInviteEmail(opts: {
    name?: string | null;
    email: string;
    tempPassword: string;
    role: AdminRole;
    loginUrl: string;
    invitedBy?: string | null;
}): { subject: string; html: string; text: string } {
    const { name, email, tempPassword, role, loginUrl, invitedBy } = opts;

    const greeting = name && name.trim() ? `Hi ${name.trim()},` : `Hi there,`;
    const roleLabel = ROLE_LABELS[role] ?? role;
    const byLine = invitedBy && invitedBy.trim()
        ? ` by <strong>${invitedBy.trim()}</strong>`
        : "";
    const byLineText = invitedBy && invitedBy.trim() ? ` by ${invitedBy.trim()}` : "";

    const credBlock = `
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:20px 0;border:1px solid #e4e4e7;border-radius:8px;background-color:#fafafa;">
          <tr>
            <td style="padding:16px 18px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.6;color:#3f3f46;">
              <div style="margin:0 0 6px 0;color:#71717a;">Login email</div>
              <div style="margin:0 0 14px 0;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:14px;color:#18181b;word-break:break-all;"><strong>${email}</strong></div>
              <div style="margin:0 0 6px 0;color:#71717a;">Temporary password</div>
              <div style="margin:0;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:16px;color:#ff5c5c;letter-spacing:0.02em;word-break:break-all;"><strong>${tempPassword}</strong></div>
            </td>
          </tr>
        </table>`;

    const body = `
        <p style="margin:0 0 16px 0;">${greeting}</p>
        <p style="margin:0 0 8px 0;">You've been invited${byLine} to the <strong>${BRAND_NAME}</strong> admin as a <strong>${roleLabel}</strong>.</p>
        <p style="margin:0 0 8px 0;">Use the credentials below to sign in:</p>
        ${credBlock}
        ${renderButton(loginUrl, "Sign in")}
        <p class="email-muted" style="margin:16px 0 8px 0;font-size:14px;color:#71717a;">For your security, you'll be asked to set a new password the first time you sign in. This temporary password will stop working after that.</p>
        <p class="email-muted" style="margin:8px 0 0 0;font-size:13px;word-break:break-all;">If the button doesn't work, open this link: <a class="email-link" href="${loginUrl}" style="color:#ff5c5c;text-decoration:underline;">${loginUrl}</a></p>
        <p class="email-muted" style="margin:16px 0 0 0;font-size:14px;color:#71717a;">If you weren't expecting this invitation, you can safely ignore this email.</p>
    `;

    const html = renderEmailLayout({
        preheader: `Your ${BRAND_NAME} admin invite — sign in and set a new password.`,
        body,
    });

    const text = [
        greeting,
        ``,
        `You've been invited${byLineText} to the ${BRAND_NAME} admin as a ${roleLabel}.`,
        ``,
        `Sign in with these credentials:`,
        `  Login email:        ${email}`,
        `  Temporary password: ${tempPassword}`,
        ``,
        `Sign in: ${loginUrl}`,
        ``,
        `For your security, you'll be asked to set a new password the first time you sign in. This temporary password will stop working after that.`,
        ``,
        `If you weren't expecting this invitation, you can safely ignore this email.`,
        ``,
        `— ${BRAND_NAME}`,
    ].join("\n");

    return { subject: TEAM_INVITE_SUBJECT, html, text };
}
