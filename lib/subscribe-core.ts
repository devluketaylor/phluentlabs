// Shared subscribe logic — the single source of truth for "add/resubscribe an
// email + send the confirm email". Both the public tRPC `subscribe.request`
// mutation AND the public HTTP API (`POST /api/v1/subscribe`) call this so the
// two entry points behave identically (same referral handling, same confirm
// flow, same dedupe rules).

import { subscribers } from "@/db/schemas/subscribers";
import { eq } from "drizzle-orm";
import { signSubscriberToken } from "@/lib/subscriber-token";
import { generateReferralCode } from "@/lib/referral";
import type { db as Db } from "@/db/client";
import { renderConfirmEmail } from "@/lib/emails/confirm-email";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

// Generate a referral code unique against existing rows (retry on collision).
async function makeUniqueReferralCode(database: typeof Db): Promise<string> {
    for (let attempt = 0; attempt < 6; attempt++) {
        const code = generateReferralCode();
        const [clash] = await database
            .select({ id: subscribers.id })
            .from(subscribers)
            .where(eq(subscribers.referralCode, code));
        if (!clash) return code;
    }
    return generateReferralCode(12);
}

async function sendConfirmEmail(to: string, confirmUrl: string, unsubscribeUrl?: string) {
    const { subject, html, text } = renderConfirmEmail({ confirmUrl, unsubscribeUrl });
    await resend.emails.send({
        from: process.env.RESEND_FROM_EMAIL ?? "onboarding@resend.dev",
        to,
        subject,
        html,
        text,
    });
}

export type SubscribeInput = {
    email: string;
    firstName?: string | null;
    lastName?: string | null;
    // Referral code from a ?ref=<code> link; unknown codes are silently ignored.
    ref?: string | null;
    // Optional tags to apply to a brand-new subscriber (e.g. an integration can
    // tag where the signup came from). Ignored for already-existing rows.
    tags?: string[];
};

export type SubscribeResult = { ok: true; alreadySubscribed: boolean };

/**
 * Core subscribe flow shared by the tRPC mutation and the public HTTP API.
 * Creates or re-pends a subscriber, resolves the referrer, and sends the
 * branded confirm email. Idempotent-ish: an already-`subscribed` email is a
 * no-op that returns { alreadySubscribed: true }.
 */
export async function subscribeCore(
    database: typeof Db,
    input: SubscribeInput,
): Promise<SubscribeResult> {
    const email = input.email.trim().toLowerCase();

    const [existing] = await database
        .select()
        .from(subscribers)
        .where(eq(subscribers.email, email));

    let id = existing?.id;

    if (!existing) {
        id = crypto.randomUUID();

        let referredBy: string | null = null;
        const ref = input.ref?.trim();
        if (ref) {
            const [referrer] = await database
                .select({ id: subscribers.id })
                .from(subscribers)
                .where(eq(subscribers.referralCode, ref));
            if (referrer) referredBy = referrer.id;
        }

        const referralCode = await makeUniqueReferralCode(database);

        // Normalize/dedupe tags; keep empty array default when none supplied.
        const tags = Array.isArray(input.tags)
            ? Array.from(
                  new Set(
                      input.tags
                          .map((t) => String(t).trim())
                          .filter((t) => t.length > 0 && t.length <= 64),
                  ),
              ).slice(0, 25)
            : undefined;

        await database.insert(subscribers).values({
            id,
            email,
            firstName: input.firstName ?? null,
            lastName: input.lastName ?? null,
            status: "pending",
            referralCode,
            referredBy,
            ...(tags && tags.length ? { tags } : {}),
        });
    } else {
        if (existing.status === "subscribed") return { ok: true, alreadySubscribed: true };

        await database
            .update(subscribers)
            .set({
                status: "pending",
                firstName: input.firstName ?? existing.firstName ?? null,
                lastName: input.lastName ?? existing.lastName ?? null,
            })
            .where(eq(subscribers.email, email));
    }

    const confirmToken = await signSubscriberToken({ subId: id!, email, scope: "confirm" });
    const confirmUrl = new URL("/confirm", process.env.NEXT_PUBLIC_APP_URL!);
    confirmUrl.searchParams.set("token", confirmToken);

    const unsubToken = await signSubscriberToken({ subId: id!, email, scope: "unsub" });
    const unsubscribeUrl = new URL("/unsubscribe", process.env.NEXT_PUBLIC_APP_URL!);
    unsubscribeUrl.searchParams.set("token", unsubToken);

    await sendConfirmEmail(email, confirmUrl.toString(), unsubscribeUrl.toString());

    return { ok: true, alreadySubscribed: false };
}
