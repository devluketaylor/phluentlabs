import { db } from "@/db/client";
import { portfolioPosts } from "@/db/schemas/portfolio";
import { desc, eq } from "drizzle-orm";
import { portfolioJson, portfolioPreflight } from "@/lib/portfolio-cors";
import { textToList } from "@/trpc/routers/portfolio-public";

// GET /api/portfolio/posts — published posts, newest first. Public read-only
// feed consumed by the portfolio site (luketaylor.io).
export const revalidate = 60;

export async function GET() {
    const rows = await db
        .select()
        .from(portfolioPosts)
        .where(eq(portfolioPosts.published, true))
        .orderBy(desc(portfolioPosts.publishedAt), desc(portfolioPosts.createdAt));

    const posts = rows.map((row) => ({
        slug: row.slug,
        title: row.title,
        description: row.description,
        coverImage: row.coverImage,
        tags: textToList(row.tags),
        publishedAt: (row.publishedAt ?? row.createdAt).toISOString(),
        updatedAt: row.updatedAt.toISOString(),
    }));

    return portfolioJson({ posts });
}

export async function OPTIONS() {
    return portfolioPreflight();
}
