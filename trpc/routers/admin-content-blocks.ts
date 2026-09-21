import { adminProcedure, editorProcedure, router } from "@/trpc/server";
import { z } from "zod";
import { desc, eq, sql } from "drizzle-orm";
import { contentBlocks } from "@/db/schemas/content-blocks";
import { recordAudit } from "@/lib/audit";
import { TRPCError } from "@trpc/server";

// Admin CRUD for the reusable content-block / snippet library. Reads are
// admin+ (any admin can insert snippets while authoring); writes are
// editor+ (viewers are read-only), matching the rest of the editor surface.
export const adminContentBlocksRouter = router({
    // Newest-first list — powers both the admin table and the editor's
    // "Snippets" insert menu.
    list: adminProcedure.query(async ({ ctx }) => {
        const rows = await ctx.db
            .select()
            .from(contentBlocks)
            .orderBy(desc(contentBlocks.createdAt));
        return { rows };
    }),

    create: editorProcedure
        .input(
            z.object({
                name: z.string().trim().min(1).max(120),
                description: z.string().trim().max(300).nullish(),
                // Body HTML; generous cap — snippets are chunks, not whole issues.
                html: z.string().trim().min(1).max(50_000),
            }),
        )
        .mutation(async ({ input, ctx }) => {
            const id = crypto.randomUUID();
            await ctx.db.insert(contentBlocks).values({
                id,
                name: input.name,
                description: input.description?.trim() || null,
                html: input.html,
            });

            await recordAudit(ctx, {
                action: "contentBlock.create",
                targetType: "contentBlock",
                targetId: id,
                metadata: { name: input.name },
            });

            return { ok: true, id };
        }),

    update: editorProcedure
        .input(
            z.object({
                id: z.string().min(1),
                name: z.string().trim().min(1).max(120),
                description: z.string().trim().max(300).nullish(),
                html: z.string().trim().min(1).max(50_000),
            }),
        )
        .mutation(async ({ input, ctx }) => {
            const [existing] = await ctx.db
                .select({ id: contentBlocks.id })
                .from(contentBlocks)
                .where(eq(contentBlocks.id, input.id));
            if (!existing) {
                throw new TRPCError({ code: "NOT_FOUND", message: "Snippet not found" });
            }

            await ctx.db
                .update(contentBlocks)
                .set({
                    name: input.name,
                    description: input.description?.trim() || null,
                    html: input.html,
                    updatedAt: new Date(),
                })
                .where(eq(contentBlocks.id, input.id));

            await recordAudit(ctx, {
                action: "contentBlock.update",
                targetType: "contentBlock",
                targetId: input.id,
                metadata: { name: input.name },
            });

            return { ok: true };
        }),

    // Bump a snippet's lightweight usage counter when it's inserted into an
    // issue. Powers the toolbar quick-insert row (most-used first). Deliberately
    // fire-and-forget from the editor — an insert should never block on this,
    // and a miss just means the ordering lags by one use. admin+ so any author
    // who can insert can record the use.
    recordUse: adminProcedure
        .input(z.object({ id: z.string().min(1) }))
        .mutation(async ({ input, ctx }) => {
            await ctx.db
                .update(contentBlocks)
                .set({
                    useCount: sql`${contentBlocks.useCount} + 1`,
                    lastUsedAt: new Date(),
                })
                .where(eq(contentBlocks.id, input.id));
            return { ok: true };
        }),

    // Deleting a snippet only removes the template — issues that already had it
    // inserted keep their copied HTML (no FK), so this is non-destructive to
    // authored content.
    remove: editorProcedure
        .input(z.object({ id: z.string().min(1) }))
        .mutation(async ({ input, ctx }) => {
            const [existing] = await ctx.db
                .select({ id: contentBlocks.id, name: contentBlocks.name })
                .from(contentBlocks)
                .where(eq(contentBlocks.id, input.id));
            if (!existing) {
                throw new TRPCError({ code: "NOT_FOUND", message: "Snippet not found" });
            }

            await ctx.db.delete(contentBlocks).where(eq(contentBlocks.id, input.id));

            await recordAudit(ctx, {
                action: "contentBlock.delete",
                targetType: "contentBlock",
                targetId: input.id,
                metadata: { name: existing.name },
            });

            return { ok: true };
        }),
});
