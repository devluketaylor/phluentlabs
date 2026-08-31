import { renderEmailLayout, renderButton, BRAND_NAME } from "@/lib/emails/layout";

export const CONFIRM_EMAIL_SUBJECT = "One quick step — confirm your PhluentLabs subscription";

/**
 * Branded confirmation email (HTML + plaintext) for double opt-in.
 * `unsubscribeUrl` is optional; when present a footer unsubscribe link is
 * included (must be minted with scope "unsub", not the confirm token).
 */
export function renderConfirmEmail(opts: {
    confirmUrl: string;
    unsubscribeUrl?: string;
}): { subject: string; html: string; text: string } {
    const { confirmUrl, unsubscribeUrl } = opts;

    const body = `
        <p style="margin:0 0 16px 0;">Welcome to <strong>${BRAND_NAME}</strong> 👋</p>
        <p style="margin:0 0 8px 0;">Thanks for subscribing! Just one quick step: tap the button below to confirm your email address and start receiving our newsletter.</p>
        ${renderButton(confirmUrl, "Confirm subscription")}
        <p class="email-muted" style="margin:16px 0 8px 0;font-size:14px;color:#71717a;">If the button doesn't work, copy and paste this link into your browser:</p>
        <p style="margin:0 0 16px 0;font-size:13px;word-break:break-all;"><a class="email-link" href="${confirmUrl}" style="color:#ff5c5c;text-decoration:underline;">${confirmUrl}</a></p>
        <p class="email-muted" style="margin:16px 0 0 0;font-size:14px;color:#71717a;">If you didn't request this, you can safely ignore this email — no subscription will be created.</p>
    `;

    const footer = unsubscribeUrl
        ? `You're receiving this because someone entered this address at ${BRAND_NAME}. Changed your mind? <a href="${unsubscribeUrl}" style="color:#a1a1aa;text-decoration:underline;">Unsubscribe</a>.`
        : undefined;

    const html = renderEmailLayout({
        preheader: "Confirm your email to finish subscribing to PhluentLabs.",
        body,
        footer,
    });

    const text = [
        `Welcome to ${BRAND_NAME}!`,
        ``,
        `Thanks for subscribing. Please confirm your email address to start receiving our newsletter by opening this link:`,
        ``,
        confirmUrl,
        ``,
        `If you didn't request this, you can safely ignore this email — no subscription will be created.`,
        unsubscribeUrl ? `` : ``,
        unsubscribeUrl ? `Changed your mind? Unsubscribe: ${unsubscribeUrl}` : ``,
        ``,
        `— ${BRAND_NAME}`,
    ]
        .filter((line, i, arr) => !(line === "" && arr[i - 1] === ""))
        .join("\n");

    return { subject: CONFIRM_EMAIL_SUBJECT, html, text };
}
