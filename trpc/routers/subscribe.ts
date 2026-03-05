import {publicProcedure, router} from "@/trpc/server";
import {z} from "zod";
import {subscribers} from "@/db/schemas/subscribers";
import {eq} from "drizzle-orm";
import {signSubscriberToken, verifySubscriberToken} from "@/lib/subscriber-token";
import {Resend} from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export const sendConfirmEmail = async (to: string, confirmUrl: string) => {
    await resend.emails.send({
        from: process.env.RESEND_FROM_EMAIL ?? "onboarding@resend.dev",
        to,
        subject: "Confirm your subscription",
        html: `
            <p>Thanks for subscribing! Please confirm your email address by clicking the link below.</p>
            <p><a href="${confirmUrl}">Confirm subscription</a></p>
            <p>If you didn't request this, you can safely ignore this email.</p>
        `,
    });
}

export const subscribeRouter = router({
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
                console.log(existing);

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

                const token = await signSubscriberToken({ subId: id!, email, scope: "confirm" })
                const confirmUrl = new URL("/confirm", process.env.NEXT_PUBLIC_APP_URL!);
                confirmUrl.searchParams.set("token", token);

                const unsubscribeUrl = new URL("/unsubscribe", process.env.NEXT_PUBLIC_APP_URL!);
                unsubscribeUrl.searchParams.set("token", token);

                console.log(unsubscribeUrl);
                await sendConfirmEmail(email, confirmUrl.toString());

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