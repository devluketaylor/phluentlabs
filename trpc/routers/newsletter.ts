import { adminProcedure, publicProcedure, router } from "@/trpc/server";
import { z } from "zod";

function toSlug(text: string): string {
    return text
        .toLowerCase()
        .trim()
        .replace(/[^\w\s-]/g, "")
        .replace(/[\s_-]+/g, "-")
        .replace(/^-+|-+$/g, "");
}
import { newsletters } from "@/db/schemas/newsletters";
import { newsletterRecipients } from "@/db/schemas/newsletter-recipients";
import { subscribers } from "@/db/schemas/subscribers";
import { and, arrayContains, count, desc, eq, lte } from "drizzle-orm";
import { Resend } from "resend";
import { signSubscriberToken } from "@/lib/subscriber-token";
import { TRPCError } from "@trpc/server";
import { sendNewsletterToSubscribers } from "@/lib/send-newsletter";

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
                slug: z.string().optional(),
            })
        )
        .mutation(async ({ input, ctx }) => {
            const id = crypto.randomUUID();
            const baseSlug = input.slug?.trim()
                ? toSlug(input.slug.trim())
                : toSlug(input.subject.trim());
            const slug = baseSlug
                ? `${baseSlug}-${id.slice(0, 8)}`
                : id.slice(0, 8);
            await ctx.db.insert(newsletters).values({
                id,
                slug,
                subject: input.subject.trim(),
                html: input.html,
                preheader: input.preheader ?? null,
                status: "draft",
                createdBy: ctx.adminUserId,
            });
            return { ok: true, id, slug };
        }),

    update: adminProcedure
        .input(
            z.object({
                id: z.string().min(1),
                subject: z.string().min(1),
                html: z.string().min(1),
                preheader: z.string().optional(),
                status: newsletterStatus,
                slug: z.string().optional(),
            })
        )
        .mutation(async ({ input, ctx }) => {
            // Load the current row so a status change from the edit form stays
            // consistent with the scheduledAt / sentAt timestamps. Setting a
            // status via this free-form Select must NOT create impossible states
            // (e.g. status="scheduled" with no scheduledAt would sit in limbo and
            // never fire from the cron due-query; status="sent" with no sentAt
            // would surface a never-actually-sent issue publicly).
            const [existing] = await ctx.db
                .select()
                .from(newsletters)
                .where(eq(newsletters.id, input.id));
            if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Newsletter not found" });

            // Only guard when the status is actually changing.
            let scheduledAt: Date | null | undefined = undefined;
            if (input.status !== existing.status) {
                if (input.status === "scheduled") {
                    if (!existing.scheduledAt) {
                        throw new TRPCError({
                            code: "BAD_REQUEST",
                            message: "Use the Schedule action to schedule a send \u2014 it sets the send time. You can't set status to Scheduled without one.",
                        });
                    }
                } else if (input.status === "sent") {
                    if (!existing.sentAt) {
                        throw new TRPCError({
                            code: "BAD_REQUEST",
                            message: "Use the Send action to send this newsletter. Status can't be set to Sent manually.",
                        });
                    }
                } else if (input.status === "draft") {
                    // Moving back to draft clears any pending schedule.
                    scheduledAt = null;
                }
            }

            await ctx.db
                .update(newsletters)
                .set({
                    subject: input.subject.trim(),
                    html: input.html,
                    preheader: input.preheader ?? null,
                    status: input.status,
                    ...(scheduledAt !== undefined ? { scheduledAt } : {}),
                    slug: input.slug?.trim() ? toSlug(input.slug.trim()) : undefined,
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
        .input(
            z.object({
                id: z.string().min(1),
                // Optional segment: when provided, only confirmed subscribers
                // carrying this tag are targeted. Omit/null = all confirmed.
                tag: z.string().trim().min(1).nullish(),
            })
        )
        .mutation(async ({ input }) => {
            try {
                const { sent } = await sendNewsletterToSubscribers(input.id, { tag: input.tag });
                return { ok: true, sent };
            } catch (e) {
                const msg = e instanceof Error ? e.message : "Send failed";
                throw new TRPCError({ code: "BAD_REQUEST", message: msg });
            }
        }),

    // Resolve the send audience WITHOUT sending: returns the recipient count
    // and a small preview list for the chosen segment (All / by tag). Powers
    // the audience selector in the Send dialog so the writer can confirm who
    // will receive the issue before firing the (irreversible) real send.
    audiencePreview: adminProcedure
        .input(
            z.object({
                tag: z.string().trim().min(1).nullish(),
            })
        )
        .query(async ({ input, ctx }) => {
            const tag = input.tag?.trim() || null;
            const where = tag
                ? and(eq(subscribers.status, "subscribed"), arrayContains(subscribers.tags, [tag]))
                : eq(subscribers.status, "subscribed");

            const [[{ total }], sample] = await Promise.all([
                ctx.db.select({ total: count() }).from(subscribers).where(where),
                ctx.db
                    .select({
                        email: subscribers.email,
                        firstName: subscribers.firstName,
                        lastName: subscribers.lastName,
                    })
                    .from(subscribers)
                    .where(where)
                    .orderBy(subscribers.email)
                    .limit(5),
            ]);

            return { tag, count: total, sample };
        }),

    // Schedule (or reschedule) a newsletter to send at a future time. A cron
    // job hits sendScheduledDue() to fire due sends. Pass null to unschedule.
    schedule: adminProcedure
        .input(
            z.object({
                id: z.string().min(1),
                scheduledAt: z.string().datetime().nullable(),
            })
        )
        .mutation(async ({ input, ctx }) => {
            const [newsletter] = await ctx.db
                .select()
                .from(newsletters)
                .where(eq(newsletters.id, input.id));

            if (!newsletter) throw new TRPCError({ code: "NOT_FOUND", message: "Newsletter not found" });
            if (newsletter.status === "sent") throw new TRPCError({ code: "BAD_REQUEST", message: "Newsletter already sent" });

            if (input.scheduledAt === null) {
                // Unschedule -> back to draft.
                await ctx.db
                    .update(newsletters)
                    .set({ status: "draft", scheduledAt: null, updatedAt: new Date() })
                    .where(eq(newsletters.id, input.id));
                return { ok: true, scheduled: false };
            }

            const when = new Date(input.scheduledAt);
            if (when.getTime() <= Date.now()) {
                throw new TRPCError({ code: "BAD_REQUEST", message: "Scheduled time must be in the future" });
            }

            await ctx.db
                .update(newsletters)
                .set({ status: "scheduled", scheduledAt: when, updatedAt: new Date() })
                .where(eq(newsletters.id, input.id));
            return { ok: true, scheduled: true, scheduledAt: when.toISOString() };
        }),

    // API-key-protected: send all scheduled newsletters whose time has passed.
    // Call this from a cron job (e.g. Vercel Cron) every few minutes.
    sendScheduledDue: publicProcedure
        .input(z.object({ apiKey: z.string().min(1) }))
        .mutation(async ({ input, ctx }) => {
            if (!process.env.NEWSLETTER_API_KEY || input.apiKey !== process.env.NEWSLETTER_API_KEY) {
                throw new TRPCError({ code: "UNAUTHORIZED" });
            }

            const due = await ctx.db
                .select({ id: newsletters.id })
                .from(newsletters)
                .where(and(eq(newsletters.status, "scheduled"), lte(newsletters.scheduledAt, new Date())));

            const results: Array<{ id: string; sent: number; error?: string }> = [];
            for (const n of due) {
                try {
                    const { sent } = await sendNewsletterToSubscribers(n.id);
                    results.push({ id: n.id, sent });
                } catch (e) {
                    results.push({ id: n.id, sent: 0, error: e instanceof Error ? e.message : "failed" });
                }
            }

            return { ok: true, processed: results.length, results };
        }),

    // Send a single test copy to a chosen address (e.g. yourself) so you can
    // proof formatting/dark-mode before the real blast. Does NOT mark as sent,
    // does NOT touch subscribers, and includes a clear [TEST] subject prefix.
    sendTest: adminProcedure
        .input(
            z.object({
                id: z.string().min(1),
                to: z.string().email(),
            })
        )
        .mutation(async ({ input, ctx }) => {
            const [newsletter] = await ctx.db
                .select()
                .from(newsletters)
                .where(eq(newsletters.id, input.id));

            if (!newsletter) throw new TRPCError({ code: "NOT_FOUND", message: "Newsletter not found" });

            const fromEmail = process.env.RESEND_FROM_EMAIL ?? "onboarding@resend.dev";

            // Mirror the real send's footer so the test matches production output,
            // but with a dummy unsubscribe link (no real token needed for a test).
            const html = `<div style="background:#fffbeb;border:1px solid #fbbf24;border-radius:6px;padding:10px 14px;margin-bottom:20px;font-size:13px;color:#92400e;">This is a <strong>test</strong> of your newsletter. Subscribers will not see this banner.</div>${newsletter.html}<p style="margin-top:32px;font-size:12px;color:#888;"><a href="#">Unsubscribe</a></p>`;

            await resend.emails.send({
                from: fromEmail,
                to: input.to,
                subject: `[TEST] ${newsletter.subject}`,
                html,
            });

            return { ok: true, to: input.to };
        }),
});

const PAGE_SIZE = 6;

export const newsletterRouter = router({
      createDraftViaApiKey: publicProcedure
    .input(
      z.object({
        subject: z.string().min(1),
        html: z.string().min(1),
        preheader: z.string().optional(),
        slug: z.string().optional(),
        seoTitle: z.string().optional(),
        metaDescription: z.string().optional(),
        apiKey: z.string().min(1),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // --- auth: shared secret, not admin session ---
      if (
        !process.env.NEWSLETTER_API_KEY ||
        input.apiKey !== process.env.NEWSLETTER_API_KEY
              ) {
        throw new TRPCError({ code: "UNAUTHORIZED" });
      }

      // --- slug: same behavior as your admin `create` ---
      const id = crypto.randomUUID();
      const baseSlug = input.slug?.trim()
        ? toSlug(input.slug.trim())
        : toSlug(input.subject.trim());
      const slug = baseSlug ? `${baseSlug}-${id.slice(0, 8)}` : id.slice(0, 8);

      // --- insert as DRAFT (never auto-publish) ---
      await ctx.db.insert(newsletters).values({
        id,
        slug,
                subject: input.subject.trim(),
        html: input.html,
        preheader: input.preheader ?? null,
        seoTitle: input.seoTitle ?? null,
        metaDescription: input.metaDescription ?? null,
        status: "draft",
        // If `createdBy` is NULLABLE: delete the next line.
        // If it's a required FK: set NEWSLETTER_BOT_USER_ID to a real user row id.
        createdBy: process.env.NEWSLETTER_BOT_USER_ID ?? "newsletter-bot",
      });

      return { ok: true, id, slug, url: `/issues/${slug}` };
    }),
    list: publicProcedure
        .input(z.object({ page: z.number().int().min(1).default(1) }))
        .query(async ({ input, ctx }) => {
            const offset = (input.page - 1) * PAGE_SIZE;

            // Public endpoint: only ever return PUBLISHED issues. Filtering here
            // (server-side) means draft content never reaches the browser at all,
            // instead of being sent down and hidden in the UI.
            const [items, [{ total }]] = await Promise.all([
                ctx.db
                    .select({
                        id: newsletters.id,
                        slug: newsletters.slug,
                        subject: newsletters.subject,
                        preheader: newsletters.preheader,
                        createdAt: newsletters.createdAt,
                        sentAt: newsletters.sentAt,
                        status: newsletters.status,
                    })
                    .from(newsletters)
                    .where(eq(newsletters.status, "sent"))
                    .orderBy(desc(newsletters.sentAt), desc(newsletters.createdAt))
                    .limit(PAGE_SIZE)
                    .offset(offset),
                ctx.db
                    .select({ total: count() })
                    .from(newsletters)
                    .where(eq(newsletters.status, "sent")),
            ]);

            return { items, total, pageSize: PAGE_SIZE };
        }),
});
