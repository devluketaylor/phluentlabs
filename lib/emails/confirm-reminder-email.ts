import { renderEmailLayout, renderButton, BRAND_NAME } from "@/lib/emails/layout";

export const CONFIRM_REMINDER_SUBJECT = `Still want in? Confirm your ${BRAND_NAME} subscription`;

/**
 * Gentle one-time reminder for pending (double opt-in) subscribers who signed
 * up but never clicked the confirm link. Sent ONCE, N days after signup, by
 * the pending-reminder cron. Branded HTML + plaintext, dark-mode-safe.
 *
 * `unsubscribeUrl` is optional; when present a footer link lets them opt out
 * of the reminder (must be minted with scope "unsub", not the confirm token).
 */
export function renderConfirmReminderEmail(opts: {
    confirmUrl: string;
    firstName?: string | null;
    unsubscribeUrl?: string;
}): { subject: string; html: string; text: string } {
    const { confirmUrl, firstName, unsubscribeUrl } = opts;
    const hi = firstName && firstName.trim() ? `Hi ${firstName.trim()},` : "Hi there,";

    const body = `
        <p style="margin:0 0 16px 0;">${hi}</p>
        <p style="margin:0 0 8px 0;">A little while ago you signed up for <strong>${BRAND_NAME}</strong>, but we never got your confirmation — so you're not receiving the newsletter yet. No worries, it happens!</p>
        <p style="margin:0 0 8px 0;">If you'd still like in, just tap below to confirm your email. This is the only reminder we'll send.</p>
        ${renderButton(confirmUrl, "Confirm my subscription")}
        <p class="email-muted" style="margin:16px 0 8px 0;font-size:14px;color:#71717a;">If the button doesn't work, copy and paste this link into your browser:</p>
        <p style="margin:0 0 16px 0;font-size:13px;word-break:break-all;"><a class="email-link" href="${confirmUrl}" style="color:#ff5c5c;text-decoration:underline;">${confirmUrl}</a></p>
        <p class="email-muted" style="margin:16px 0 0 0;font-size:14px;color:#71717a;">Changed your mind? No action needed — just ignore this and we won't email you again.</p>
    `;

    const footer = unsubscribeUrl
        ? `You're receiving this because someone entered this address at ${BRAND_NAME}. Don't want this? <a href="${unsubscribeUrl}" style="color:#a1a1aa;text-decoration:underline;">Unsubscribe</a>.`
        : undefined;

    const html = renderEmailLayout({
        preheader: `You started subscribing to ${BRAND_NAME} — confirm to finish.`,
        body,
        footer,
    });

    const text = [
        hi,
        ``,
        `A little while ago you signed up for ${BRAND_NAME}, but we never got your confirmation — so you're not receiving the newsletter yet.`,
        ``,
        `If you'd still like in, confirm your email by opening this link (this is the only reminder we'll send):`,
        ``,
        confirmUrl,
        ``,
        `Changed your mind? No action needed — just ignore this and we won't email you again.`,
        unsubscribeUrl ? `` : ``,
        unsubscribeUrl ? `Don't want this? Unsubscribe: ${unsubscribeUrl}` : ``,
        ``,
        `— ${BRAND_NAME}`,
    ]
        .filter((line, i, arr) => !(line === "" && arr[i - 1] === ""))
        .join("\n");

    return { subject: CONFIRM_REMINDER_SUBJECT, html, text };
}
