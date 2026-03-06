import { adminProcedure, publicProcedure, router } from "@/trpc/server";
import { z } from "zod";
import { newsletters } from "@/db/schemas/newsletters";
import { newsletterRecipients } from "@/db/schemas/newsletter-recipients";
import { subscribers } from "@/db/schemas/subscribers";
import { count, desc, eq } from "drizzle-orm";
import { Resend } from "resend";
import { signSubscriberToken } from "@/lib/subscriber-token";
import { TRPCError } from "@trpc/server";

const resend = new Resend(process.env.RESEND_API_KEY);

const newsletterStatus = z.enum(["draft", "scheduled", "sent"]);

export const adminNewsletterRouter = router({
    list: adminProcedure
        .input(
            z.object({
                limit: z.number().int().min(1).max(100).default(50),
                offset: z.number().int().min(0).default(0),
            })
        )
        .query(async ({ input, ctx }) => {
            const [items, [{ total }]] = await Promise.all([
                ctx.db
                    .select()
                    .from(newsletters)
                    .orderBy(desc(newsletters.createdAt))
                    .limit(input.limit)
                    .offset(input.offset),
                ctx.db.select({ total: count() }).from(newsletters),
            ]);
            return { items, total };
        }),

    create: adminProcedure
        .input(
            z.object({
                subject: z.string().min(1),
                html: z.string().min(1),
                preheader: z.string().optional(),
            })
        )
        .mutation(async ({ input, ctx }) => {
            const id = crypto.randomUUID();
            await ctx.db.insert(newsletters).values({
                id,
                subject: input.subject.trim(),
                html: input.html,
                preheader: input.preheader ?? null,
                status: "draft",
                createdBy: ctx.adminUserId,
            });
            return { ok: true, id };
        }),

    update: adminProcedure
        .input(
            z.object({
                id: z.string().min(1),
                subject: z.string().min(1),
                html: z.string().min(1),
                preheader: z.string().optional(),
                status: newsletterStatus,
            })
        )
        .mutation(async ({ input, ctx }) => {
            await ctx.db
                .update(newsletters)
                .set({
                    subject: input.subject.trim(),
                    html: input.html,
                    preheader: input.preheader ?? null,
                    status: input.status,
                    updatedAt: new Date(),
                })
                .where(eq(newsletters.id, input.id));
            return { ok: true };
        }),

    delete: adminProcedure
        .input(z.object({ id: z.string().min(1) }))
        .mutation(async ({ input, ctx }) => {
            await ctx.db.delete(newsletters).where(eq(newsletters.id, input.id));
            return { ok: true };
        }),

    send: adminProcedure
        .input(z.object({ id: z.string().min(1) }))
        .mutation(async ({ input, ctx }) => {
            const [newsletter] = await ctx.db
                .select()
                .from(newsletters)
                .where(eq(newsletters.id, input.id));

            if (!newsletter) throw new TRPCError({ code: "NOT_FOUND", message: "Newsletter not found" });
            if (newsletter.status === "sent") throw new TRPCError({ code: "BAD_REQUEST", message: "Newsletter already sent" });

            const allSubscribers = await ctx.db
                .select({ id: subscribers.id, email: subscribers.email })
                .from(subscribers)
                .where(eq(subscribers.status, "subscribed"));

            if (allSubscribers.length === 0) return { ok: true, sent: 0 };

            const fromEmail = process.env.RESEND_FROM_EMAIL ?? "onboarding@resend.dev";
            const appUrl = process.env.NEXT_PUBLIC_APP_URL!;

            // Send in batches of 100 (Resend limit)
            const BATCH_SIZE = 100;
            for (let i = 0; i < allSubscribers.length; i += BATCH_SIZE) {
                const batch = allSubscribers.slice(i, i + BATCH_SIZE);

                const emails = await Promise.all(
                    batch.map(async (sub) => {
                        const unsubToken = await signSubscriberToken({ subId: sub.id, email: sub.email, scope: "unsub" });
                        const unsubUrl = new URL("/unsubscribe", appUrl);
                        unsubUrl.searchParams.set("token", unsubToken);

                        const html = `${newsletter.html}<p style="margin-top:32px;font-size:12px;color:#888;">
                            <a href="${unsubUrl.toString()}">Unsubscribe</a>
                        </p>`;

                        return {
                            from: fromEmail,
                            to: sub.email,
                            subject: newsletter.subject,
                            html,
                        };
                    })
                );

                await resend.batch.send(emails);

                await ctx.db.insert(newsletterRecipients).values(
                    batch.map((sub) => ({
                        id: crypto.randomUUID(),
                        newsletterId: newsletter.id,
                        subscriberId: sub.id,
                        status: "sent",
                        sentAt: new Date(),
                    }))
                ).onConflictDoNothing();
            }

            await ctx.db
                .update(newsletters)
                .set({ status: "sent", sentAt: new Date(), updatedAt: new Date() })
                .where(eq(newsletters.id, input.id));

            return { ok: true, sent: allSubscribers.length };
        }),
});

const PAGE_SIZE = 6;

export const newsletterRouter = router({
    list: publicProcedure
        .input(z.object({ page: z.number().int().min(1).default(1) }))
        .query(async ({ input, ctx }) => {
            const offset = (input.page - 1) * PAGE_SIZE;

            const [items, [{ total }]] = await Promise.all([
                ctx.db
                    .select({
                        id: newsletters.id,
                        subject: newsletters.subject,
                        preheader: newsletters.preheader,
                        createdAt: newsletters.createdAt,
                    })
                    .from(newsletters)
                    .orderBy(desc(newsletters.createdAt))
                    .limit(PAGE_SIZE)
                    .offset(offset),
                ctx.db.select({ total: count() }).from(newsletters),
            ]);

            return { items, total, pageSize: PAGE_SIZE };
        }),
});
