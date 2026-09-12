import { adminProcedure, editorProcedure, roleProcedure, router } from "@/trpc/server";
import { z } from "zod";
import { and, desc, eq, ne, count } from "drizzle-orm";
import { publications, subscriberPublications } from "@/db/schemas/publications";
import { newsletters } from "@/db/schemas/newsletters";
import { recordAudit } from "@/lib/audit";
import { TRPCError } from "@trpc/server";

// Deleting a publication is destructive-ish (drops opt-in join rows + orphans
// its issues back to the primary stream); keep it to admin+.
const publicationDeleteProcedure = roleProcedure("admin");

function toSlug(input: string): string {
    return input
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 60);
}

// Admin management for publications ("sections" / streams). Strictly additive:
// creating publications does NOT change the existing single-stream behaviour
// until issues/subscribers are explicitly attached to a non-primary one.
export const adminPublicationsRouter = router({
    // Newest-first list with per-publication issue + opt-in counts.
    list: adminProcedure.query(async ({ ctx }) => {
        const rows = await ctx.db
            .select()
            .from(publications)
            .orderBy(desc(publications.isPrimary), desc(publications.createdAt));

        // Attach lightweight counts (issues assigned + opted-in subscribers).
        const withCounts = await Promise.all(
            rows.map(async (p) => {
                const [[issues], [optIns]] = await Promise.all([
                    ctx.db
                        .select({ n: count() })
                        .from(newsletters)
                        .where(eq(newsletters.publicationId, p.id)),
                    ctx.db
                        .select({ n: count() })
                        .from(subscriberPublications)
                        .where(eq(subscriberPublications.publicationId, p.id)),
                ]);
                return { ...p, issueCount: issues.n, optInCount: optIns.n };
            }),
        );
        return { rows: withCounts };
    }),

    create: editorProcedure
        .input(
            z.object({
                name: z.string().trim().min(1).max(120),
                description: z.string().trim().max(500).nullish(),
                slug: z.string().trim().max(60).nullish(),
                // If true (and no other primary exists yet) mark as primary.
                isPrimary: z.boolean().default(false),
            }),
        )
        .mutation(async ({ input, ctx }) => {
            const id = crypto.randomUUID();
            const base = input.slug?.trim() ? toSlug(input.slug) : toSlug(input.name);
            const slug = base || id.slice(0, 8);

            // Enforce slug uniqueness with a friendly error rather than a raw DB
            // constraint blow-up.
            const [dupe] = await ctx.db
                .select({ id: publications.id })
                .from(publications)
                .where(eq(publications.slug, slug));
            if (dupe) {
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: `A publication with the slug "${slug}" already exists. Pick a different name or slug.`,
                });
            }

            // Only ever ONE primary. If this one asks to be primary, demote any
            // existing primary first (single transaction of intent).
            let isPrimary = input.isPrimary;
            if (isPrimary) {
                await ctx.db
                    .update(publications)
                    .set({ isPrimary: false, updatedAt: new Date() })
                    .where(eq(publications.isPrimary, true));
            } else {
                // If NO primary exists yet, the first publication becomes primary
                // automatically so the default stream is always resolvable.
                const [{ n }] = await ctx.db
                    .select({ n: count() })
                    .from(publications)
                    .where(eq(publications.isPrimary, true));
                if (n === 0) isPrimary = true;
            }

            await ctx.db.insert(publications).values({
                id,
                slug,
                name: input.name,
                description: input.description?.trim() || null,
                isPrimary,
            });

            await recordAudit(ctx, {
                action: "publication.create",
                targetType: "publication",
                targetId: id,
                metadata: { name: input.name, slug, isPrimary },
            });

            return { ok: true, id, slug, isPrimary };
        }),

    update: editorProcedure
        .input(
            z.object({
                id: z.string().min(1),
                name: z.string().trim().min(1).max(120),
                description: z.string().trim().max(500).nullish(),
                isPrimary: z.boolean().optional(),
                archived: z.boolean().optional(),
            }),
        )
        .mutation(async ({ input, ctx }) => {
            const [existing] = await ctx.db
                .select()
                .from(publications)
                .where(eq(publications.id, input.id));
            if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Publication not found" });

            // Promoting to primary demotes the current primary.
            if (input.isPrimary === true && !existing.isPrimary) {
                await ctx.db
                    .update(publications)
                    .set({ isPrimary: false, updatedAt: new Date() })
                    .where(and(eq(publications.isPrimary, true), ne(publications.id, input.id)));
            }
            // Never allow demoting the sole primary to none — there must always
            // be a resolvable default. (Promote another first.)
            if (input.isPrimary === false && existing.isPrimary) {
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: "Promote another publication to primary instead of un-setting this one — there must always be a primary.",
                });
            }

            const set: Record<string, unknown> = {
                name: input.name,
                description: input.description?.trim() || null,
                updatedAt: new Date(),
            };
            if (input.isPrimary !== undefined) set.isPrimary = input.isPrimary || existing.isPrimary;
            if (input.archived !== undefined) {
                if (input.archived && existing.isPrimary) {
                    throw new TRPCError({
                        code: "BAD_REQUEST",
                        message: "You can't archive the primary publication. Promote another to primary first.",
                    });
                }
                set.archivedAt = input.archived ? new Date() : null;
            }

            await ctx.db.update(publications).set(set).where(eq(publications.id, input.id));

            await recordAudit(ctx, {
                action: "publication.update",
                targetType: "publication",
                targetId: input.id,
                metadata: { name: input.name, isPrimary: set.isPrimary, archived: input.archived },
            });

            return { ok: true };
        }),

    // Delete a publication. Its issues fall back to the primary stream
    // (publicationId set to NULL, i.e. the default) and opt-in rows cascade
    // away. Primary publications cannot be deleted.
    remove: publicationDeleteProcedure
        .input(z.object({ id: z.string().min(1) }))
        .mutation(async ({ input, ctx }) => {
            const [existing] = await ctx.db
                .select()
                .from(publications)
                .where(eq(publications.id, input.id));
            if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Publication not found" });
            if (existing.isPrimary) {
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: "You can't delete the primary publication. Promote another to primary first.",
                });
            }

            // Orphan its issues back to the default stream (NULL == primary).
            await ctx.db
                .update(newsletters)
                .set({ publicationId: null, updatedAt: new Date() })
                .where(eq(newsletters.publicationId, input.id));

            // Opt-in rows cascade on the FK; delete the publication row.
            await ctx.db.delete(publications).where(eq(publications.id, input.id));

            await recordAudit(ctx, {
                action: "publication.delete",
                targetType: "publication",
                targetId: input.id,
                metadata: { name: existing.name, slug: existing.slug },
            });

            return { ok: true };
        }),
});
