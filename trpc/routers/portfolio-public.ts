import { publicProcedure, router } from "@/trpc/server";
import { z } from "zod";
import { and, asc, desc, eq } from "drizzle-orm";
import { portfolioPosts, portfolioProjects, portfolioSettings } from "@/db/schemas/portfolio";

// Public, read-only portfolio API. Consumed by the separate portfolio site
// (luketaylor.io) so it never needs DB creds or admin auth. Only PUBLISHED
// content is exposed; draft posts / unpublished projects are hidden.
//
// Also surfaced as plain REST at /api/portfolio/* (see app/api/portfolio) with
// permissive CORS for cross-origin fetches from the portfolio app.

const SETTINGS_ID = "default";

// Stored newline-joined text -> string[].
export const textToList = (t: string | null | undefined): string[] =>
    (t ?? "")
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);

function serializePost(row: typeof portfolioPosts.$inferSelect) {
    return {
        slug: row.slug,
        title: row.title,
        description: row.description,
        body: row.body,
        coverImage: row.coverImage,
        tags: textToList(row.tags),
        publishedAt: (row.publishedAt ?? row.createdAt).toISOString(),
        updatedAt: row.updatedAt.toISOString(),
    };
}

function serializeProject(row: typeof portfolioProjects.$inferSelect) {
    return {
        id: row.id,
        title: row.title,
        description: row.description,
        repoUrl: row.repoUrl,
        liveUrl: row.liveUrl,
        image: row.image,
        tech: textToList(row.tech),
        featured: row.featured,
        sortOrder: row.sortOrder,
    };
}

export const portfolioPublicRouter = router({
    // Published posts, newest first (by publishedAt, falling back to createdAt).
    posts: publicProcedure.query(async ({ ctx }) => {
        const rows = await ctx.db
            .select()
            .from(portfolioPosts)
            .where(eq(portfolioPosts.published, true))
            .orderBy(desc(portfolioPosts.publishedAt), desc(portfolioPosts.createdAt));
        return { posts: rows.map(serializePost) };
    }),

    // One published post by slug.
    post: publicProcedure
        .input(z.object({ slug: z.string().min(1).max(80) }))
        .query(async ({ input, ctx }) => {
            const [row] = await ctx.db
                .select()
                .from(portfolioPosts)
                .where(and(eq(portfolioPosts.slug, input.slug), eq(portfolioPosts.published, true)));
            return { post: row ? serializePost(row) : null };
        }),

    // Published projects, manual sort order then newest.
    projects: publicProcedure.query(async ({ ctx }) => {
        const rows = await ctx.db
            .select()
            .from(portfolioProjects)
            .where(eq(portfolioProjects.published, true))
            .orderBy(asc(portfolioProjects.sortOrder), desc(portfolioProjects.createdAt));
        return { projects: rows.map(serializeProject) };
    }),

    // Public site settings (hero/about/socials).
    settings: publicProcedure.query(async ({ ctx }) => {
        const [row] = await ctx.db
            .select()
            .from(portfolioSettings)
            .where(eq(portfolioSettings.id, SETTINGS_ID));
        if (!row) return { settings: null };
        return {
            settings: {
                heroTitle: row.heroTitle,
                heroSubtitle: row.heroSubtitle,
                aboutHtml: row.aboutHtml,
                githubUrl: row.githubUrl,
                twitterUrl: row.twitterUrl,
                linkedinUrl: row.linkedinUrl,
                email: row.email,
            },
        };
    }),
});
