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
                html: newsletters.html,
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
    // Reading time for the featured issue's sample peek — strip tags, ~220wpm
    // (matches the per-issue public page). Computed server-side so the full
    // HTML is only shipped once (inside the sample-peek payload below).
    const featuredHtml = featured?.html ?? "";
    const featuredWords = featuredHtml
        .replace(/<[^>]*>/g, " ")
        .split(/\s+/)
        .filter(Boolean).length;
    const featuredData = featured
        ? {
              slug: featured.slug ?? featured.id,
              subject: featured.subject,
              preheader: featured.preheader ?? null,
              date: (featured.sentAt ?? featured.createdAt)?.toISOString() ?? null,
              // The rendered issue body powers the on-page "See a sample" peek
              // so a prospective subscriber can preview a real issue before
              // handing over an email — no navigation, no subscribe required.
              html: featuredHtml,
              readingMinutes: Math.max(1, Math.round(featuredWords / 220)),
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

    // FAQPage structured data — mirrors the on-page FAQ accordion so Google can
    // surface FAQ rich results. Keep the Q/A text in sync with FAQS in
    // home-client.tsx.
    const faqJsonLd = {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: [
            {
                q: "Is it really free?",
                a: "Yes — completely free, forever. No paywall, no premium tier, no catch. Just a good weekly read.",
            },
            {
                q: "How often will you email me?",
                a: "Once a week, every Sunday. One focused issue — never drip campaigns, never spam, never a sales blast.",
            },
            {
                q: "What's it actually about?",
                a: "The web as it's actually built: tools, patterns, and shifts pulled from real projects that shipped. Practical over hype, always filtered for signal.",
            },
            {
                q: "Can I unsubscribe?",
                a: "Anytime, in one click — every issue has an unsubscribe link, no hard feelings. You can also pause or update your preferences instead of leaving entirely.",
            },
        ].map((f) => ({
            "@type": "Question",
            name: f.q,
            acceptedAnswer: { "@type": "Answer", text: f.a },
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
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
            />
            <HomeClient featured={featuredData} issueCount={recent.length} />
        </>
    );
}
