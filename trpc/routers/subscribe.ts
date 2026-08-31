import {publicProcedure, router} from "@/trpc/server";
import {z} from "zod";
import {subscribers} from "@/db/schemas/subscribers";
import {count, eq} from "drizzle-orm";
import {signSubscriberToken, verifySubscriberToken} from "@/lib/subscriber-token";
import {generateReferralCode} from "@/lib/referral";
import type {db as Db} from "@/db/client";
import {Resend} from "resend";
import {renderConfirmEmail} from "@/lib/emails/confirm-email";
import {renderWelcomeEmail} from "@/lib/emails/welcome-email";

const resend = new Resend(process.env.RESEND_API_KEY);

// Generate a referral code that's unique against existing rows. Retries a few
// times on the (statistically rare) collision before giving up gracefully.
const makeUniqueReferralCode = async (database: typeof Db): Promise<string> => {
    for (let attempt = 0; attempt < 6; attempt++) {
        const code = generateReferralCode();
        const [clash] = await database
            .select({id: subscribers.id})
            .from(subscribers)
            .where(eq(subscribers.referralCode, code));
        if (!clash) return code;
    }
    // Extremely unlikely; fall back to a longer code to virtually guarantee it.
    return generateReferralCode(12);
}

export const sendConfirmEmail = async (
    to: string,
    confirmUrl: string,
    unsubscribeUrl?: string,
) => {
    const {subject, html, text} = renderConfirmEmail({confirmUrl, unsubscribeUrl});
    await resend.emails.send({
        from: process.env.RESEND_FROM_EMAIL ?? "onboarding@resend.dev",
        to,
        subject,
        html,
        text,
    });
}

/**
 * Sends the branded welcome email once, right after a subscriber confirms.
 * Fire-and-forget from the caller's perspective (errors are swallowed so a
 * transient Resend hiccup never fails the confirm flow — the subscriber is
 * already confirmed at that point).
 */
export const sendWelcomeEmail = async (
    to: string,
    opts: {firstName?: string | null; shareUrl?: string; unsubscribeUrl?: string; preferencesUrl?: string},
) => {
    const {subject, html, text} = renderWelcomeEmail(opts);
    await resend.emails.send({
        from: process.env.RESEND_FROM_EMAIL ?? "onboarding@resend.dev",
        to,
        subject,
        html,
        text,
    });
}

export const subscribeRouter = router({
        // Public: live count of confirmed subscribers for social proof on the
        // homepage. Only counts status = "subscribed" (not pending/unsubscribed).
        count: publicProcedure.query(async ({ ctx }) => {
            try {
                const [{ total }] = await ctx.db
                    .select({ total: count() })
                    .from(subscribers)
                    .where(eq(subscribers.status, "subscribed"));
                return { count: total };
            } catch {
                return { count: 0 };
            }
        }),
        request: publicProcedure
            .input(
                z.object({
                    email: z.string().email(),
                    firstName: z.string().min(1).optional(),
                    lastName: z.string().min(1).optional(),
                    // Referral code from a ?ref=<code> link on the subscribe
                    // page. Optional; ignored if it doesn't match a subscriber.
                    ref: z.string().min(1).max(32).optional(),
                }),
            )
            .mutation(async ({ input, ctx }) => {
                const email = input.email.trim().toLowerCase();
                const [existing] = await ctx.db
                    .select()
                    .from(subscribers)
                    .where(eq(subscribers.email, email));

                let id = existing?.id;

                if (!existing) {
                    id = crypto.randomUUID();

                    // Resolve the referrer (if any) from the ?ref= code. A
                    // subscriber can't refer themselves (different email = new
                    // row, so that's implicitly true here); unknown codes are
                    // silently ignored so a bad link never blocks signup.
                    let referredBy: string | null = null;
                    const ref = input.ref?.trim();
                    if (ref) {
                        const [referrer] = await ctx.db
                            .select({id: subscribers.id})
                            .from(subscribers)
                            .where(eq(subscribers.referralCode, ref));
                        if (referrer) referredBy = referrer.id;
                    }

                    const referralCode = await makeUniqueReferralCode(ctx.db);

                    await ctx.db.insert(subscribers).values({
                        id,
                        email,
                        firstName: input.firstName ?? null,
                        lastName: input.lastName ?? null,
                        status: "pending",
                        referralCode,
                        referredBy,
                    });
                } else {
                    if (existing.status === "subscribed") return { ok: true, alreadySubscribed: true }

                    await ctx.db
                        .update(subscribers)
                        .set({
                            status: "pending",
                            firstName: input.firstName ?? existing.firstName ?? null,
                            lastName: input.lastName ?? existing.lastName ?? null,
                        })
                        .where(eq(subscribers.email, email));
                }

                const confirmToken = await signSubscriberToken({ subId: id!, email, scope: "confirm" })
                const confirmUrl = new URL("/confirm", process.env.NEXT_PUBLIC_APP_URL!);
                confirmUrl.searchParams.set("token", confirmToken);

                // Unsubscribe link must use the "unsub" scope (30d), not the
                // confirm token — the /unsubscribe handler rejects non-"unsub".
                const unsubToken = await signSubscriberToken({ subId: id!, email, scope: "unsub" })
                const unsubscribeUrl = new URL("/unsubscribe", process.env.NEXT_PUBLIC_APP_URL!);
                unsubscribeUrl.searchParams.set("token", unsubToken);

                await sendConfirmEmail(email, confirmUrl.toString(), unsubscribeUrl.toString());

                return { ok: true, alreadySubscribed: false };
            }),

        confirm: publicProcedure
            .input(z.object({ token: z.string().min(1) }))
            .mutation(async ({ input, ctx }) => {
                const payload = await verifySubscriberToken(input.token);
                if (payload.scope !== "confirm") throw new Error("Invalid token")

                // Load the row first so we can tell a first-time confirm from a
                // repeat click on the confirm link (which shouldn't re-send the
                // welcome email).
                const [existing] = await ctx.db
                    .select({
                        id: subscribers.id,
                        email: subscribers.email,
                        firstName: subscribers.firstName,
                        status: subscribers.status,
                        referralCode: subscribers.referralCode,
                    })
                    .from(subscribers)
                    .where(eq(subscribers.id, payload.subId));

                await ctx.db
                    .update(subscribers)
                    .set({ status: "subscribed", confirmedAt: new Date() })
                    .where(eq(subscribers.id, payload.subId))

                // Welcome email automation (Kit-style): send the branded welcome
                // email ONCE, only on the pending -> subscribed transition. Skip
                // if they were already subscribed (repeat confirm click) so we
                // never double-send. Fire-and-forget: a Resend hiccup must not
                // fail the confirm — they're already confirmed in the DB.
                if (existing && existing.status !== "subscribed") {
                    try {
                        const appUrl = process.env.NEXT_PUBLIC_APP_URL;
                        const shareUrl = existing.referralCode && appUrl
                            ? (() => {
                                const u = new URL("/", appUrl);
                                u.searchParams.set("ref", existing.referralCode!);
                                return u.toString();
                            })()
                            : undefined;

                        let unsubscribeUrl: string | undefined;
                        let preferencesUrl: string | undefined;
                        if (appUrl) {
                            const unsubToken = await signSubscriberToken({
                                subId: existing.id,
                                email: existing.email,
                                scope: "unsub",
                            });
                            const u = new URL("/unsubscribe", appUrl);
                            u.searchParams.set("token", unsubToken);
                            unsubscribeUrl = u.toString();

                            // Prefs token (scope "prefs") for the manage-
                            // preferences link in the welcome email footer.
                            const prefsToken = await signSubscriberToken({
                                subId: existing.id,
                                email: existing.email,
                                scope: "prefs",
                            });
                            const p = new URL("/preferences", appUrl);
                            p.searchParams.set("token", prefsToken);
                            preferencesUrl = p.toString();
                        }

                        await sendWelcomeEmail(existing.email, {
                            firstName: existing.firstName,
                            shareUrl,
                            unsubscribeUrl,
                            preferencesUrl,
                        });
                    } catch (err) {
                        console.error("welcome email send failed", err);
                    }
                }

                return { ok: true };
            }),

        // Public but token-gated: return the CALLER'S OWN referral code + how
        // many people they've referred. The signed confirm token proves the
        // caller owns this subscriber row, so we never expose anyone else's
        // data — only the subscriber identified by the token. Powers the
        // "your referral link" surface shown after a successful confirm.
        myReferral: publicProcedure
            .input(z.object({ token: z.string().min(1) }))
            .query(async ({ input, ctx }) => {
                const payload = await verifySubscriberToken(input.token);
                if (payload.scope !== "confirm") throw new Error("Invalid token")

                const [me] = await ctx.db
                    .select({
                        id: subscribers.id,
                        referralCode: subscribers.referralCode,
                    })
                    .from(subscribers)
                    .where(eq(subscribers.id, payload.subId));
                if (!me) throw new Error("Subscriber not found");

                // Backfill a code for legacy rows that predate the referral
                // program (they were created before referralCode existed).
                let referralCode = me.referralCode;
                if (!referralCode) {
                    referralCode = await makeUniqueReferralCode(ctx.db);
                    await ctx.db
                        .update(subscribers)
                        .set({ referralCode })
                        .where(eq(subscribers.id, me.id));
                }

                const [{ referred }] = await ctx.db
                    .select({ referred: count() })
                    .from(subscribers)
                    .where(eq(subscribers.referredBy, me.id));

                return { referralCode, referralCount: referred };
            }),

        unsubscribe: publicProcedure
            .input(z.object({ token: z.string().min(1) }))
            .mutation(async ({ input, ctx }) => {
                const payload = await verifySubscriberToken(input.token);
                // Accept both a dedicated "unsub" token AND a "prefs" token, so
                // the preferences center (which is handed a prefs token) can
                // also let a subscriber fully unsubscribe without minting a
                // second link. Both prove ownership of this row.
                if (payload.scope !== "unsub" && payload.scope !== "prefs") throw new Error("Invalid token")

                await ctx.db
                .update(subscribers)
                    .set({ status: "unsubscribed", unsubscribedAt: new Date() })
                    .where(eq(subscribers.id, payload.subId))

                return { ok: true };
            }),

        // ── Subscriber preferences center (Kit-style) ──────────────────────
        // A signed-token public surface where a subscriber can update their
        // name, PAUSE (temporarily stop) / RESUME emails, or fully
        // unsubscribe — instead of the unsubscribe-only page. Reuses the same
        // signed-token pattern as unsubscribe; the token is scope "prefs"
        // (30d) and proves ownership of exactly this one subscriber row, so no
        // one else's data is ever exposed.

        // Read the caller's OWN current preferences (name + status). Token-gated.
        getPreferences: publicProcedure
            .input(z.object({ token: z.string().min(1) }))
            .query(async ({ input, ctx }) => {
                const payload = await verifySubscriberToken(input.token);
                if (payload.scope !== "prefs") throw new Error("Invalid token")

                const [me] = await ctx.db
                    .select({
                        email: subscribers.email,
                        firstName: subscribers.firstName,
                        lastName: subscribers.lastName,
                        status: subscribers.status,
                    })
                    .from(subscribers)
                    .where(eq(subscribers.id, payload.subId));
                if (!me) throw new Error("Subscriber not found");

                return {
                    email: me.email,
                    firstName: me.firstName ?? "",
                    lastName: me.lastName ?? "",
                    status: me.status,
                };
            }),

        // Update the caller's OWN preferences. Token-gated (scope "prefs").
        // Supports editing name and changing the delivery state to one of:
        //   subscribed  → actively receiving (resume from paused)
        //   paused      → temporarily stop (still confirmed, easy to resume)
        //   unsubscribed→ fully opt out
        // "paused" is a new free-form status value — no schema change needed
        // (status is a free-form text column). The send audience only targets
        // status = "subscribed", so paused subscribers are automatically
        // skipped by the existing send path.
        updatePreferences: publicProcedure
            .input(z.object({
                token: z.string().min(1),
                firstName: z.string().max(200).optional(),
                lastName: z.string().max(200).optional(),
                status: z.enum(["subscribed", "paused", "unsubscribed"]).optional(),
            }))
            .mutation(async ({ input, ctx }) => {
                const payload = await verifySubscriberToken(input.token);
                if (payload.scope !== "prefs") throw new Error("Invalid token")

                const [me] = await ctx.db
                    .select({ id: subscribers.id })
                    .from(subscribers)
                    .where(eq(subscribers.id, payload.subId));
                if (!me) throw new Error("Subscriber not found");

                const patch: Partial<typeof subscribers.$inferInsert> = {
                    updatedAt: new Date(),
                };

                // Only write name fields when explicitly provided; normalize
                // blanks to null so we don't store empty strings.
                if (input.firstName !== undefined) {
                    const v = input.firstName.trim();
                    patch.firstName = v.length ? v : null;
                }
                if (input.lastName !== undefined) {
                    const v = input.lastName.trim();
                    patch.lastName = v.length ? v : null;
                }

                if (input.status !== undefined) {
                    patch.status = input.status;
                    if (input.status === "unsubscribed") {
                        patch.unsubscribedAt = new Date();
                    } else if (input.status === "subscribed") {
                        // Resuming from paused/unsubscribed: clear the opt-out
                        // timestamp so the record reflects an active subscriber.
                        patch.unsubscribedAt = null;
                    }
                }

                await ctx.db
                    .update(subscribers)
                    .set(patch)
                    .where(eq(subscribers.id, payload.subId));

                return { ok: true };
            }),
})