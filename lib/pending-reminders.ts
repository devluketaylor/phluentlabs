// Double opt-in reminder automation.
//
// Pending subscribers who signed up but never clicked the confirm link would
// otherwise sit in `pending` forever, never receiving the newsletter. This
// sends ONE gentle reminder, N days after signup, and never again — tracked by
// the additive `confirmReminderSentAt` column (NULL = not yet reminded).
//
// Pure list-hygiene: this NEVER deletes anyone. Stale-pending cleanup is a
// separate, MANUAL admin action (the admin surface lists them; deletion stays
// a human decision via the existing bulk-delete tooling).

import { subscribers } from "@/db/schemas/subscribers";
import { and, eq, isNull, lte, gte } from "drizzle-orm";
import { signSubscriberToken } from "@/lib/subscriber-token";
import type { db as Db } from "@/db/client";
import { renderConfirmReminderEmail } from "@/lib/emails/confirm-reminder-email";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

// Send the reminder N days after signup (default 3). Don't remind rows older
// than MAX days (default 30) — those are cold and better handled by manual
// cleanup than a surprise email months later.
export const REMINDER_AFTER_DAYS = 3;
export const REMINDER_MAX_AGE_DAYS = 30;
// Reminder confirm links live longer than the normal 24h so the recipient has
// a fair window to act on the reminder.
const REMINDER_CONFIRM_TOKEN_TTL = "7d";

export type PendingReminderResult = {
    considered: number;
    sent: number;
    failed: number;
    errors: Array<{ id: string; error: string }>;
};

function daysAgo(days: number): Date {
    return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

/**
 * Find eligible pending subscribers and send each a one-time confirm reminder,
 * stamping confirmReminderSentAt so it's never re-sent. Eligibility:
 *   - status = "pending"
 *   - confirmReminderSentAt IS NULL (never reminded)
 *   - createdAt <= now - afterDays  (waited long enough)
 *   - createdAt >= now - maxAgeDays (not too cold)
 *
 * Best-effort per-row: a Resend failure on one subscriber does NOT stamp that
 * row (so a later run retries it) and does NOT abort the batch.
 */
export async function sendPendingReminders(
    database: typeof Db,
    opts: { afterDays?: number; maxAgeDays?: number; limit?: number } = {},
): Promise<PendingReminderResult> {
    const afterDays = opts.afterDays ?? REMINDER_AFTER_DAYS;
    const maxAgeDays = opts.maxAgeDays ?? REMINDER_MAX_AGE_DAYS;
    const limit = Math.min(Math.max(opts.limit ?? 200, 1), 1000);

    const appUrl = process.env.NEXT_PUBLIC_APP_URL;

    const rows = await database
        .select({
            id: subscribers.id,
            email: subscribers.email,
            firstName: subscribers.firstName,
        })
        .from(subscribers)
        .where(
            and(
                eq(subscribers.status, "pending"),
                isNull(subscribers.confirmReminderSentAt),
                lte(subscribers.createdAt, daysAgo(afterDays)),
                gte(subscribers.createdAt, daysAgo(maxAgeDays)),
            ),
        )
        .orderBy(subscribers.createdAt)
        .limit(limit);

    const result: PendingReminderResult = {
        considered: rows.length,
        sent: 0,
        failed: 0,
        errors: [],
    };

    for (const row of rows) {
        try {
            let confirmUrl = "";
            let unsubscribeUrl: string | undefined;
            if (appUrl) {
                const confirmToken = await signSubscriberToken(
                    { subId: row.id, email: row.email, scope: "confirm" },
                    REMINDER_CONFIRM_TOKEN_TTL,
                );
                const c = new URL("/confirm", appUrl);
                c.searchParams.set("token", confirmToken);
                confirmUrl = c.toString();

                const unsubToken = await signSubscriberToken({
                    subId: row.id,
                    email: row.email,
                    scope: "unsub",
                });
                const u = new URL("/unsubscribe", appUrl);
                u.searchParams.set("token", unsubToken);
                unsubscribeUrl = u.toString();
            }

            const { subject, html, text } = renderConfirmReminderEmail({
                confirmUrl,
                firstName: row.firstName,
                unsubscribeUrl,
            });

            await resend.emails.send({
                from: process.env.RESEND_FROM_EMAIL ?? "onboarding@resend.dev",
                to: row.email,
                subject,
                html,
                text,
            });

            // Stamp ONLY after a successful send so a failure is retried later.
            await database
                .update(subscribers)
                .set({ confirmReminderSentAt: new Date() })
                .where(eq(subscribers.id, row.id));

            result.sent += 1;
        } catch (e) {
            result.failed += 1;
            result.errors.push({
                id: row.id,
                error: e instanceof Error ? e.message : "send failed",
            });
        }
    }

    return result;
}
