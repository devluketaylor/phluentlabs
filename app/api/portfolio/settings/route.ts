import { db } from "@/db/client";
import { portfolioSettings } from "@/db/schemas/portfolio";
import { eq } from "drizzle-orm";
import { portfolioJson, portfolioPreflight } from "@/lib/portfolio-cors";

// GET /api/portfolio/settings — public site settings (hero/about/socials).
export const revalidate = 60;

const SETTINGS_ID = "default";

export async function GET() {
    const [row] = await db
        .select()
        .from(portfolioSettings)
        .where(eq(portfolioSettings.id, SETTINGS_ID));

    if (!row) return portfolioJson({ settings: null });

    return portfolioJson({
        settings: {
            heroTitle: row.heroTitle,
            heroSubtitle: row.heroSubtitle,
            aboutHtml: row.aboutHtml,
            githubUrl: row.githubUrl,
            twitterUrl: row.twitterUrl,
            linkedinUrl: row.linkedinUrl,
            email: row.email,
        },
    });
}

export async function OPTIONS() {
    return portfolioPreflight();
}
