import { renderEmailLayout, renderButton, BRAND_NAME } from "@/lib/emails/layout";

export const WELCOME_EMAIL_SUBJECT = `You're in — welcome to ${BRAND_NAME} 🎉`;

/**
 * Branded welcome email (HTML + plaintext) sent once, immediately after a
 * subscriber confirms their email (double opt-in complete). Reuses the shared
 * `renderEmailLayout` shell so it matches the confirm email visually.
 *
 * - `firstName` optional: personalizes the greeting when we have it.
 * - `shareUrl` optional: the subscriber's personal referral link — when
 *   present we invite them to share it (ties into the referral program).
 * - `unsubscribeUrl` optional: footer unsubscribe link (mint with scope
 *   "unsub", never the confirm token).
 */
export function renderWelcomeEmail(opts: {
    firstName?: string | null;
    shareUrl?: string;
    unsubscribeUrl?: string;
}): { subject: string; html: string; text: string } {
    const { firstName, shareUrl, unsubscribeUrl } = opts;

    const greeting = firstName && firstName.trim()
        ? `Hey ${firstName.trim()},`
        : `Hey there,`;

    const sharePart = shareUrl
        ? `
        <p style="margin:24px 0 8px 0;">Know someone who'd enjoy it too? Share your personal link — we keep track of everyone you bring in:</p>
        <p style="margin:0 0 4px 0;font-size:13px;word-break:break-all;"><a href="${shareUrl}" style="color:#ff5c5c;text-decoration:underline;">${shareUrl}</a></p>`
        : "";

    const body = `
        <p style="margin:0 0 16px 0;">${greeting}</p>
        <p style="margin:0 0 16px 0;">Your subscription to <strong>${BRAND_NAME}</strong> is confirmed — welcome aboard! 🎉</p>
        <p style="margin:0 0 8px 0;">You'll now get our newsletter delivered straight to your inbox. Expect sharp, practical insights with no fluff. We're glad you're here.</p>
        ${sharePart}
        <p style="margin:24px 0 0 0;font-size:14px;color:#71717a;">In the meantime, keep an eye on your inbox — the next issue is on its way.</p>
    `;

    const footer = unsubscribeUrl
        ? `You're receiving this because you confirmed your subscription at ${BRAND_NAME}. Changed your mind? <a href="${unsubscribeUrl}" style="color:#a1a1aa;text-decoration:underline;">Unsubscribe</a>.`
        : undefined;

    const html = renderEmailLayout({
        preheader: `Your ${BRAND_NAME} subscription is confirmed — welcome aboard!`,
        body,
        footer,
    });

    const text = [
        greeting,
        ``,
        `Your subscription to ${BRAND_NAME} is confirmed — welcome aboard!`,
        ``,
        `You'll now get our newsletter delivered straight to your inbox. Expect sharp, practical insights with no fluff. We're glad you're here.`,
        shareUrl ? `` : ``,
        shareUrl ? `Know someone who'd enjoy it too? Share your personal link:` : ``,
        shareUrl ? shareUrl : ``,
        ``,
        `In the meantime, keep an eye on your inbox — the next issue is on its way.`,
        unsubscribeUrl ? `` : ``,
        unsubscribeUrl ? `Changed your mind? Unsubscribe: ${unsubscribeUrl}` : ``,
        ``,
        `— ${BRAND_NAME}`,
    ]
        .filter((line, i, arr) => !(line === "" && arr[i - 1] === ""))
        .join("\n");

    return { subject: WELCOME_EMAIL_SUBJECT, html, text };
}
