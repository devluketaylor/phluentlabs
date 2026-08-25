import {publicProcedure, router} from "@/trpc/server";
import {z} from "zod";
import {subscribers} from "@/db/schemas/subscribers";
import {count, eq} from "drizzle-orm";
import {signSubscriberToken, verifySubscriberToken} from "@/lib/subscriber-token";
import {Resend} from "resend";
import {renderConfirmEmail} from "@/lib/emails/confirm-email";

const resend = new Resend(process.env.RESEND_API_KEY);

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

                    await ctx.db.insert(subscribers).values({
                        id,
                        email,
                        firstName: input.firstName ?? null,
                        lastName: input.lastName ?? null,
                        status: "pending"
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

                await ctx.db
                    .update(subscribers)
                    .set({ status: "subscribed", confirmedAt: new Date() })
                    .where(eq(subscribers.id, payload.subId))

                return { ok: true };
            }),

        unsubscribe: publicProcedure
            .input(z.object({ token: z.string().min(1) }))
            .mutation(async ({ input, ctx }) => {
                const payload = await verifySubscriberToken(input.token);
                if (payload.scope !== "unsub") throw new Error("Invalid token")

                await ctx.db
                .update(subscribers)
                    .set({ status: "unsubscribed", unsubscribedAt: new Date() })
                    .where(eq(subscribers.id, payload.subId))

                return { ok: true };
            }),
})