import { adminProcedure, editorProcedure, router } from "@/trpc/server";
import { z } from "zod";
import { and, asc, desc, eq } from "drizzle-orm";
import { portfolioPosts, portfolioProjects, portfolioSettings } from "@/db/schemas/portfolio";
import { recordAudit } from "@/lib/audit";
import { TRPCError } from "@trpc/server";

// Admin CRUD for Luke's DB-backed portfolio (blog posts, projects, site
// settings). Reads are admin+ (any admin-area role can view the tab); writes
// are editor+ (viewers are read-only), matching the rest of the editor surface.
//
// The public portfolio site never touches these — it consumes the read-only
// `portfolioPublic` router / REST endpoints instead.

const SETTINGS_ID = "default";

// Normalize a title/slug into a safe URL segment.
function slugify(input: string): string {
    return input
        .toLowerCase()
        .trim()
        .replace(/['"]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 80);
}

// tags/tech come from the editor as an array; we store newline-joined text.
const listToText = (arr: string[] | undefined) =>
    (arr ?? []).map((s) => s.trim()).filter(Boolean).join("\n");

export const adminPortfolioRouter = router({
    // ── Blog posts ────────────────────────────────────────────────────────────
    listPosts: adminProcedure.query(async ({ ctx }) => {
        const rows = await ctx.db
            .select()
            .from(portfolioPosts)
            .orderBy(desc(portfolioPosts.createdAt));
        return { rows };
    }),

    getPost: adminProcedure
        .input(z.object({ id: z.string().min(1) }))
        .query(async ({ input, ctx }) => {
            const [row] = await ctx.db
                .select()
                .from(portfolioPosts)
                .where(eq(portfolioPosts.id, input.id));
            if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Post not found" });
            return { row };
        }),

    createPost: editorProcedure
        .input(
            z.object({
                title: z.string().trim().min(1).max(200),
                slug: z.string().trim().max(80).optional(),
                description: z.string().trim().max(500).nullish(),
                body: z.string().max(200_000).default(""),
                coverImage: z.string().url().nullish(),
                tags: z.array(z.string().trim().max(40)).max(20).optional(),
                published: z.boolean().default(false),
                publishedAt: z.date().nullish(),
            }),
        )
        .mutation(async ({ input, ctx }) => {
            const id = crypto.randomUUID();
            const slug = slugify(input.slug || input.title);
            if (!slug) throw new TRPCError({ code: "BAD_REQUEST", message: "Could not derive a slug" });

            // Enforce unique slug up front for a friendly error (the DB unique
            // index is the real guard).
            const [clash] = await ctx.db
                .select({ id: portfolioPosts.id })
                .from(portfolioPosts)
                .where(eq(portfolioPosts.slug, slug));
            if (clash) throw new TRPCError({ code: "CONFLICT", message: `Slug "${slug}" is already taken` });

            await ctx.db.insert(portfolioPosts).values({
                id,
                slug,
                title: input.title,
                description: input.description?.trim() || null,
                body: input.body,
                coverImage: input.coverImage || null,
                tags: listToText(input.tags),
                published: input.published,
                publishedAt: input.published ? (input.publishedAt ?? new Date()) : (input.publishedAt ?? null),
            });

            await recordAudit(ctx, {
                action: "portfolioPost.create",
                targetType: "portfolioPost",
                targetId: id,
                metadata: { title: input.title, slug, published: input.published },
            });

            return { ok: true, id, slug };
        }),

    updatePost: editorProcedure
        .input(
            z.object({
                id: z.string().min(1),
                title: z.string().trim().min(1).max(200),
                slug: z.string().trim().max(80).optional(),
                description: z.string().trim().max(500).nullish(),
                body: z.string().max(200_000).default(""),
                coverImage: z.string().url().nullish(),
                tags: z.array(z.string().trim().max(40)).max(20).optional(),
                published: z.boolean().default(false),
                publishedAt: z.date().nullish(),
            }),
        )
        .mutation(async ({ input, ctx }) => {
            const [existing] = await ctx.db
                .select()
                .from(portfolioPosts)
                .where(eq(portfolioPosts.id, input.id));
            if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Post not found" });

            const slug = slugify(input.slug || input.title);
            if (!slug) throw new TRPCError({ code: "BAD_REQUEST", message: "Could not derive a slug" });

            // Slug must stay unique across OTHER posts.
            const [clash] = await ctx.db
                .select({ id: portfolioPosts.id })
                .from(portfolioPosts)
                .where(eq(portfolioPosts.slug, slug));
            if (clash && clash.id !== input.id) {
                throw new TRPCError({ code: "CONFLICT", message: `Slug "${slug}" is already taken` });
            }

            // First publish stamps publishedAt if not already set.
            const publishedAt = input.published
                ? (input.publishedAt ?? existing.publishedAt ?? new Date())
                : (input.publishedAt ?? existing.publishedAt ?? null);

            await ctx.db
                .update(portfolioPosts)
                .set({
                    slug,
                    title: input.title,
                    description: input.description?.trim() || null,
                    body: input.body,
                    coverImage: input.coverImage || null,
                    tags: listToText(input.tags),
                    published: input.published,
                    publishedAt,
                    updatedAt: new Date(),
                })
                .where(eq(portfolioPosts.id, input.id));

            await recordAudit(ctx, {
                action: "portfolioPost.update",
                targetType: "portfolioPost",
                targetId: input.id,
                metadata: { title: input.title, slug, published: input.published },
            });

            return { ok: true, slug };
        }),

    removePost: editorProcedure
        .input(z.object({ id: z.string().min(1) }))
        .mutation(async ({ input, ctx }) => {
            const [existing] = await ctx.db
                .select({ id: portfolioPosts.id, title: portfolioPosts.title })
                .from(portfolioPosts)
                .where(eq(portfolioPosts.id, input.id));
            if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Post not found" });

            await ctx.db.delete(portfolioPosts).where(eq(portfolioPosts.id, input.id));

            await recordAudit(ctx, {
                action: "portfolioPost.delete",
                targetType: "portfolioPost",
                targetId: input.id,
                metadata: { title: existing.title },
            });

            return { ok: true };
        }),

    // ── Projects ──────────────────────────────────────────────────────────────
    listProjects: adminProcedure.query(async ({ ctx }) => {
        const rows = await ctx.db
            .select()
            .from(portfolioProjects)
            .orderBy(asc(portfolioProjects.sortOrder), desc(portfolioProjects.createdAt));
        return { rows };
    }),

    createProject: editorProcedure
        .input(
            z.object({
                title: z.string().trim().min(1).max(200),
                description: z.string().max(2_000).default(""),
                repoUrl: z.string().url().nullish(),
                liveUrl: z.string().url().nullish(),
                image: z.string().url().nullish(),
                tech: z.array(z.string().trim().max(40)).max(30).optional(),
                featured: z.boolean().default(false),
                published: z.boolean().default(true),
                sortOrder: z.number().int().min(0).max(9999).default(0),
            }),
        )
        .mutation(async ({ input, ctx }) => {
            const id = crypto.randomUUID();
            await ctx.db.insert(portfolioProjects).values({
                id,
                title: input.title,
                description: input.description,
                repoUrl: input.repoUrl || null,
                liveUrl: input.liveUrl || null,
                image: input.image || null,
                tech: listToText(input.tech),
                featured: input.featured,
                published: input.published,
                sortOrder: input.sortOrder,
            });

            await recordAudit(ctx, {
                action: "portfolioProject.create",
                targetType: "portfolioProject",
                targetId: id,
                metadata: { title: input.title },
            });

            return { ok: true, id };
        }),

    updateProject: editorProcedure
        .input(
            z.object({
                id: z.string().min(1),
                title: z.string().trim().min(1).max(200),
                description: z.string().max(2_000).default(""),
                repoUrl: z.string().url().nullish(),
                liveUrl: z.string().url().nullish(),
                image: z.string().url().nullish(),
                tech: z.array(z.string().trim().max(40)).max(30).optional(),
                featured: z.boolean().default(false),
                published: z.boolean().default(true),
                sortOrder: z.number().int().min(0).max(9999).default(0),
            }),
        )
        .mutation(async ({ input, ctx }) => {
            const [existing] = await ctx.db
                .select({ id: portfolioProjects.id })
                .from(portfolioProjects)
                .where(eq(portfolioProjects.id, input.id));
            if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });

            await ctx.db
                .update(portfolioProjects)
                .set({
                    title: input.title,
                    description: input.description,
                    repoUrl: input.repoUrl || null,
                    liveUrl: input.liveUrl || null,
                    image: input.image || null,
                    tech: listToText(input.tech),
                    featured: input.featured,
                    published: input.published,
                    sortOrder: input.sortOrder,
                    updatedAt: new Date(),
                })
                .where(eq(portfolioProjects.id, input.id));

            await recordAudit(ctx, {
                action: "portfolioProject.update",
                targetType: "portfolioProject",
                targetId: input.id,
                metadata: { title: input.title },
            });

            return { ok: true };
        }),

    removeProject: editorProcedure
        .input(z.object({ id: z.string().min(1) }))
        .mutation(async ({ input, ctx }) => {
            const [existing] = await ctx.db
                .select({ id: portfolioProjects.id, title: portfolioProjects.title })
                .from(portfolioProjects)
                .where(eq(portfolioProjects.id, input.id));
            if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });

            await ctx.db.delete(portfolioProjects).where(eq(portfolioProjects.id, input.id));

            await recordAudit(ctx, {
                action: "portfolioProject.delete",
                targetType: "portfolioProject",
                targetId: input.id,
                metadata: { title: existing.title },
            });

            return { ok: true };
        }),

    // ── Site settings (singleton) ───────────────────────────────────────────────
    getSettings: adminProcedure.query(async ({ ctx }) => {
        const [row] = await ctx.db
            .select()
            .from(portfolioSettings)
            .where(eq(portfolioSettings.id, SETTINGS_ID));
        return { row: row ?? null };
    }),

    saveSettings: editorProcedure
        .input(
            z.object({
                heroTitle: z.string().max(200).default(""),
                heroSubtitle: z.string().max(500).default(""),
                aboutHtml: z.string().max(100_000).default(""),
                githubUrl: z.string().url().nullish(),
                twitterUrl: z.string().url().nullish(),
                linkedinUrl: z.string().url().nullish(),
                email: z.string().email().nullish(),
            }),
        )
        .mutation(async ({ input, ctx }) => {
            const values = {
                id: SETTINGS_ID,
                heroTitle: input.heroTitle,
                heroSubtitle: input.heroSubtitle,
                aboutHtml: input.aboutHtml,
                githubUrl: input.githubUrl || null,
                twitterUrl: input.twitterUrl || null,
                linkedinUrl: input.linkedinUrl || null,
                email: input.email || null,
                updatedAt: new Date(),
            };

            // Upsert the singleton row.
            await ctx.db
                .insert(portfolioSettings)
                .values(values)
                .onConflictDoUpdate({ target: portfolioSettings.id, set: values });

            await recordAudit(ctx, {
                action: "portfolioSettings.save",
                targetType: "portfolioSettings",
                targetId: SETTINGS_ID,
            });

            return { ok: true };
        }),
});
