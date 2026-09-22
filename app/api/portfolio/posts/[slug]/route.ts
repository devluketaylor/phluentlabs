import { db } from "@/db/client";
import { portfolioPosts } from "@/db/schemas/portfolio";
import { and, eq } from "drizzle-orm";
import { portfolioJson, portfolioPreflight } from "@/lib/portfolio-cors";
import { textToList } from "@/trpc/routers/portfolio-public";

// GET /api/portfolio/posts/[slug] — one published post incl. body HTML.
export const revalidate = 60;

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
    const { slug } = await params;
    const [row] = await db
        .select()
        .from(portfolioPosts)
        .where(and(eq(portfolioPosts.slug, slug), eq(portfolioPosts.published, true)));

    if (!row) return portfolioJson({ post: null }, { status: 404 });

    return portfolioJson({
        post: {
            slug: row.slug,
            title: row.title,
            description: row.description,
            body: row.body,
            coverImage: row.coverImage,
            tags: textToList(row.tags),
            publishedAt: (row.publishedAt ?? row.createdAt).toISOString(),
            updatedAt: row.updatedAt.toISOString(),
        },
    });
}

export async function OPTIONS() {
    return portfolioPreflight();
}
