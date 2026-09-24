import { db } from "@/db/client";
import { subscribers } from "@/db/schemas/subscribers";
import { and, eq, isNotNull, lte, or, isNull, gt, type SQL } from "drizzle-orm";

/**
 * Subscriber snooze / time-boxed pause (Tier 15).
 *
 * A `subscribed` subscriber can pause delivery until a future date without
 * unsubscribing. It is stored on the nullable `subscribers.pausedUntil` column:
 *   - pausedUntil = NULL              → not snoozed (normal delivery)
 *   - pausedUntil in the FUTURE       → currently snoozed (skip in send audience)
 *   - pausedUntil in the PAST         → snooze expired (auto-resume, then deliver)
 *
 * The indefinite free-form `paused` STATUS is unchanged and independent: it's an
 * open-ended pause (pausedUntil is NULL for it) and is already skipped by the
 * send audience because the audience only targets status = "subscribed".
 */

// Allowed snooze durations offered in the preferences center. Weeks → ms.
export const SNOOZE_WEEK_OPTIONS = [2, 4, 8] as const;
export type SnoozeWeeks = (typeof SNOOZE_WEEK_OPTIONS)[number];

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export function snoozeUntil(weeks: SnoozeWeeks, from: Date = new Date()): Date {
    return new Date(from.getTime() + weeks * WEEK_MS);
}

/**
 * A subscriber is "actively receiving" (eligible for a send) when they are
 * status = "subscribed" AND not currently snoozed — i.e. pausedUntil is NULL or
 * already in the past. Use this as the base audience predicate everywhere the
 * old `eq(subscribers.status, "subscribed")` filter was used, so a snoozed
 * subscriber is uniformly skipped by both the live send and the preview count.
 */
export function activeSubscriberWhere(now: Date = new Date()): SQL {
    return and(
        eq(subscribers.status, "subscribed"),
        or(isNull(subscribers.pausedUntil), lte(subscribers.pausedUntil, now)),
    )!;
}

/**
 * Auto-resume anyone whose snooze has elapsed: clear pausedUntil for every
 * `subscribed` row whose pausedUntil is now in the past. Called at the start of
 * the send path (and safe to call from a cron) so an expired snooze becomes a
 * clean active subscriber again. Returns the number of rows resumed.
 *
 * Idempotent + cheap: only touches rows that actually elapsed.
 */
export async function autoResumeElapsedSnoozes(now: Date = new Date()): Promise<number> {
    const resumed = await db
        .update(subscribers)
        .set({ pausedUntil: null, updatedAt: now })
        .where(
            and(
                eq(subscribers.status, "subscribed"),
                isNotNull(subscribers.pausedUntil),
                lte(subscribers.pausedUntil, now),
            ),
        )
        .returning({ id: subscribers.id });
    return resumed.length;
}

// Re-export a small helper so callers can build a "currently snoozed" predicate
// (status subscribed AND pausedUntil strictly in the future) for reporting.
export function currentlySnoozedWhere(now: Date = new Date()): SQL {
    return and(
        eq(subscribers.status, "subscribed"),
        isNotNull(subscribers.pausedUntil),
        gt(subscribers.pausedUntil, now),
    )!;
}
