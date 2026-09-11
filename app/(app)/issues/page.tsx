import { db } from "@/db/client";
import { newsletters } from "@/db/schemas/newsletters";
import { and, count, desc, eq, ilike, or } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { Rss } from "lucide-react";
import { IssuesArchive, type ArchiveIssue } from "@/components/issues-archive";
import { StickySubscribe } from "@/components/sticky-subscribe";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://phluentlabs.com";
const PAGE_SIZE = 20;

// Refresh the archive hourly so newly-sent issues appear without a redeploy,
// while keeping the page statically cheap for search engines.
export const revalidate = 3600;

export const metadata: Metadata = {
    title: "All Issues",
    description:
        "Every past issue of PhluentLabs — notes on building the web, for developers. Browse and search the full archive.",
    alternates: {
        canonical: `${APP_URL}/issues`,
        types: {
            "application/rss+xml": `${APP_URL}/feed.xml`,
        },
    },
    openGraph: {
        type: "website",
        title: "PhluentLabs — Issue archive",
        description:
            "Every past issue of PhluentLabs — notes on building the web, for developers.",
        url: `${APP_URL}/issues`,
        siteName: "PhluentLabs",
    },
    twitter: {
        card: "summary_large_image",
        title: "PhluentLabs — Issue archive",
        description:
            "Every past issue of PhluentLabs — notes on building the web, for developers.",
    },
};

type Props = { searchParams: Promise<{ page?: string; q?: string }> };

// Server-side archive search. Scans PUBLISHED issues only, matching the query
// against subject, preheader AND body HTML (case-insensitive substring),
// paginated server-side so it scales past any client cap and gives us a real
// GET-addressable search URL (/issues?q=). Draft/scheduled content never reaches
// the browser. `total` is the count of MATCHING issues; `grandTotal` is the count
// of all published issues (for the header line when no query is active).
async function getIssues(q: string, page: number) {
    try {
        const publishedOnly = eq(newsletters.status, "sent");
        const where = q
            ? and(
                  publishedOnly,
                  or(
                      ilike(newsletters.subject, `%${q}%`),
                      ilike(newsletters.preheader, `%${q}%`),
                      ilike(newsletters.html, `%${q}%`)
                  )
              )
            : publishedOnly;

        const offset = (page - 1) * PAGE_SIZE;

        const [rows, [{ total }], [{ total: grandTotal }]] = await Promise.all([
            db
                .select({
                    id: newsletters.id,
                    slug: newsletters.slug,
                    subject: newsletters.subject,
                    preheader: newsletters.preheader,
                    html: newsletters.html,
                    sentAt: newsletters.sentAt,
                    createdAt: newsletters.createdAt,
                })
                .from(newsletters)
                .where(where)
                .orderBy(desc(newsletters.sentAt), desc(newsletters.createdAt))
                .limit(PAGE_SIZE)
                .offset(offset),
            db.select({ total: count() }).from(newsletters).where(where),
            db.select({ total: count() }).from(newsletters).where(publishedOnly),
        ]);

        const issues: ArchiveIssue[] = rows.map((r) => {
            // Reading time: strip HTML, count words, ~220 wpm. Computed here so the
            // browser never receives the full issue HTML for the index.
            const words = r.html.replace(/<[^>]*>/g, " ").split(/\s+/).filter(Boolean).length;
            const readingMinutes = Math.max(1, Math.round(words / 220));
            const dateMs = (r.sentAt ?? r.createdAt)?.getTime() ?? Date.now();
            return {
                id: r.id,
                slug: r.slug ?? r.id,
                subject: r.subject,
                preheader: r.preheader,
                dateMs,
                readingMinutes,
            };
        });

        return {
            issues,
            total: total ?? issues.length,
            grandTotal: grandTotal ?? total ?? issues.length,
        };
    } catch {
        return { issues: [] as ArchiveIssue[], total: 0, grandTotal: 0 };
    }
}

export default async function IssuesArchivePage({ searchParams }: Props) {
    const sp = await searchParams;
    const q = (sp.q ?? "").trim().slice(0, 200);
    const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
    const { issues, total, grandTotal } = await getIssues(q, page);

    // CollectionPage describing the archive, with an embedded ItemList that
    // enumerates every published issue (position-ordered, newest first). Good
    // for rich results and helps crawlers discover the full back-catalogue.
    const collectionJsonLd = {
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        "@id": `${APP_URL}/issues`,
        url: `${APP_URL}/issues`,
        name: "All Issues — PhluentLabs",
        description:
            "Every past issue of PhluentLabs — notes on building the web, for developers.",
        inLanguage: "en",
        isPartOf: { "@id": `${APP_URL}/#website` },
        mainEntity: {
            "@type": "ItemList",
            itemListOrder: "https://schema.org/ItemListOrderDescending",
            numberOfItems: issues.length,
            itemListElement: issues.map((issue, i) => ({
                "@type": "ListItem",
                position: i + 1,
                url: `${APP_URL}/issues/${issue.slug}`,
                name: issue.subject,
            })),
        },
    };

    return (
        <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6 sm:py-12">
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(collectionJsonLd) }}
            />
            <header className="mb-8 space-y-3">
                <div className="flex items-start justify-between gap-4">
                    <div className="space-y-2">
                        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
                            Issue archive
                        </h1>
                        <p className="text-muted-foreground leading-relaxed">
                            Every issue of{" "}
                            <span className="font-medium text-foreground">PhluentLabs</span> —
                            notes on building the web, for developers.
                        </p>
                    </div>
                    <Link
                        href="/feed.xml"
                        className="inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
                        title="Subscribe via RSS"
                    >
                        <Rss className="h-3.5 w-3.5" />
                        RSS
                    </Link>
                </div>
                {grandTotal > 0 && (
                    <p className="text-sm text-muted-foreground">
                        {grandTotal} issue{grandTotal === 1 ? "" : "s"} published.
                    </p>
                )}
            </header>

            <IssuesArchive
                issues={issues}
                total={total}
                page={page}
                pageSize={PAGE_SIZE}
                query={q}
            />

            {/* Dismissible floating subscribe affordance for archive browsers. */}
            <StickySubscribe />
        </div>
    );
}
