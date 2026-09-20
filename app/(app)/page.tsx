import type { Metadata } from "next";
import { db } from "@/db/client";
import { newsletters } from "@/db/schemas/newsletters";
import { desc, eq } from "drizzle-orm";
import HomeClient from "./home-client";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://phluentlabs.com";

// Refresh recent-issue structured data hourly without a redeploy.
export const revalidate = 3600;

// Strong, unique homepage metadata. The root layout supplies sensible sitewide
// defaults; this makes the landing page's title/description/OG explicit and
// keyword-rich for its role as the primary entry point.
export const metadata: Metadata = {
    title: {
        absolute: "PhluentLabs — the web, as it's actually built",
    },
    description:
        "Field notes from real projects — tools, patterns, and shifts worth your attention, minus the hype. A free Sunday newsletter for developers by Luke Taylor.",
    alternates: {
        canonical: APP_URL,
        types: {
            "application/rss+xml": `${APP_URL}/feed.xml`,
        },
    },
    openGraph: {
        type: "website",
        title: "PhluentLabs — the web, as it's actually built",
        description:
            "Field notes from real projects — tools, patterns, and shifts worth your attention, minus the hype. Free, every Sunday.",
        url: APP_URL,
        siteName: "PhluentLabs",
    },
    twitter: {
        card: "summary",
        title: "PhluentLabs — the web, as it's actually built",
        description:
            "Field notes from real projects — tools, patterns, and shifts worth your attention, minus the hype. Free, every Sunday.",
        creator: "@luketaylordev",
    },
};

async function getRecentIssues() {
    // Only PUBLISHED ("sent") issues; never expose drafts. Cap at the most
    // recent handful for the homepage ItemList.
    try {
        const rows = await db
            .select({
                slug: newsletters.slug,
                id: newsletters.id,
                subject: newsletters.subject,
                preheader: newsletters.preheader,
                sentAt: newsletters.sentAt,
                createdAt: newsletters.createdAt,
            })
            .from(newsletters)
            .where(eq(newsletters.status, "sent"))
            .orderBy(desc(newsletters.sentAt), desc(newsletters.createdAt))
            .limit(10);
        return rows;
    } catch {
        return [];
    }
}

export default async function HomePage() {
    const recent = await getRecentIssues();
    // The most recent published issue gets a featured showcase on the homepage.
    const featured = recent[0] ?? null;
    const featuredData = featured
        ? {
              slug: featured.slug ?? featured.id,
              subject: featured.subject,
              preheader: featured.preheader ?? null,
              date: (featured.sentAt ?? featured.createdAt)?.toISOString() ?? null,
          }
        : null;

    // Blog with an embedded ItemList of the latest issues. This helps search
    // engines understand the homepage as the hub of a periodical and surface
    // recent posts. Falls back to a bare Blog node if the DB is unreachable.
    const homeJsonLd = {
        "@context": "https://schema.org",
        "@type": "Blog",
        "@id": `${APP_URL}/#blog`,
        url: APP_URL,
        name: "PhluentLabs",
        description:
            "Field notes from real projects — a free Sunday newsletter for developers.",
        inLanguage: "en",
        publisher: {
            "@type": "Organization",
            name: "PhluentLabs",
            url: APP_URL,
        },
        blogPost: recent.map((r) => ({
            "@type": "BlogPosting",
            headline: r.subject,
            description: r.preheader ?? r.subject,
            url: `${APP_URL}/issues/${r.slug ?? r.id}`,
            datePublished: (r.sentAt ?? r.createdAt)?.toISOString(),
        })),
    };

    const itemListJsonLd = {
        "@context": "https://schema.org",
        "@type": "ItemList",
        name: "Recent PhluentLabs issues",
        itemListOrder: "https://schema.org/ItemListOrderDescending",
        numberOfItems: recent.length,
        itemListElement: recent.map((r, i) => ({
            "@type": "ListItem",
            position: i + 1,
            url: `${APP_URL}/issues/${r.slug ?? r.id}`,
            name: r.subject,
        })),
    };

    return (
        <>
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(homeJsonLd) }}
            />
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListJsonLd) }}
            />
            <HomeClient featured={featuredData} issueCount={recent.length} />
        </>
    );
}
