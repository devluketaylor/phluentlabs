import { db } from "@/db/client";
import { portfolioProjects } from "@/db/schemas/portfolio";
import { asc, desc, eq } from "drizzle-orm";
import { portfolioJson, portfolioPreflight } from "@/lib/portfolio-cors";
import { textToList } from "@/trpc/routers/portfolio-public";

// GET /api/portfolio/projects — published projects, manual sort then newest.
export const revalidate = 60;

export async function GET() {
    const rows = await db
        .select()
        .from(portfolioProjects)
        .where(eq(portfolioProjects.published, true))
        .orderBy(asc(portfolioProjects.sortOrder), desc(portfolioProjects.createdAt));

    const projects = rows.map((row) => ({
        id: row.id,
        title: row.title,
        description: row.description,
        repoUrl: row.repoUrl,
        liveUrl: row.liveUrl,
        image: row.image,
        tech: textToList(row.tech),
        featured: row.featured,
        sortOrder: row.sortOrder,
    }));

    return portfolioJson({ projects });
}

export async function OPTIONS() {
    return portfolioPreflight();
}
