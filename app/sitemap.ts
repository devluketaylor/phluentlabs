import type { MetadataRoute } from "next";
import { db } from "@/db/client";
import { newsletters } from "@/db/schemas/newsletters";
import { eq } from "drizzle-orm";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://phluentlabs.com";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
    // Static, indexable routes.
    const staticRoutes: MetadataRoute.Sitemap = [
        {
            url: APP_URL,
            lastModified: new Date(),
            changeFrequency: "weekly",
            priority: 1,
        },
    ];

    // Published issues only — never expose drafts to search engines.
    let issueRoutes: MetadataRoute.Sitemap = [];
    try {
        const issues = await db
            .select({
                slug: newsletters.slug,
                updatedAt: newsletters.updatedAt,
                sentAt: newsletters.sentAt,
            })
            .from(newsletters)
            .where(eq(newsletters.status, "sent"));

        issueRoutes = issues
            .filter((issue): issue is { slug: string; updatedAt: Date; sentAt: Date | null } => Boolean(issue.slug))
            .map((issue) => ({
                url: `${APP_URL}/issues/${issue.slug}`,
                lastModified: issue.updatedAt ?? issue.sentAt ?? new Date(),
                changeFrequency: "monthly" as const,
                priority: 0.8,
            }));
    } catch {
        // If the DB is unreachable at build/runtime, still return static routes
        // rather than failing the whole sitemap.
        issueRoutes = [];
    }

    return [...staticRoutes, ...issueRoutes];
}
