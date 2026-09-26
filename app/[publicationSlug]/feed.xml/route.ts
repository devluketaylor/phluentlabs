import { db } from "@/db/client";
import { newsletters } from "@/db/schemas/newsletters";
import { publications } from "@/db/schemas/publications";
import { and, desc, eq, isNull, or } from "drizzle-orm";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://phluentlabs.com";
const SITE_TITLE = "PhluentLabs";
const AUTHOR = "Luke Taylor";

// Per-publication RSS feed: /<publication-slug>/feed.xml
//
// We have a site-wide /feed.xml (every sent issue). Multi-publication support
// landed in Tier 6, so each stream should be independently subscribable in a
// reader. This route scopes the same feed builder to a single publication.
//
// Mirrors the archive-page semantics: the PRIMARY publication also owns legacy
// NULL-publicationId issues (those are conceptually the primary/default stream),
// while a non-primary publication only owns issues explicitly assigned to it.
// Archived publications still expose a feed (their issues are preserved) — the
// archive only stops NEW opt-ins, it doesn't hide already-published issues.

// Revalidate hourly so newly-sent issues show up without a redeploy.
export const revalidate = 3600;

function escapeXml(unsafe: string): string {
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");
}

export async function GET(
    _request: Request,
    { params }: { params: Promise<{ publicationSlug: string }> },
) {
    const { publicationSlug } = await params;

    // Resolve the publication by slug.
    let pub:
        | { id: string; slug: string; name: string; description: string | null; isPrimary: boolean }
        | undefined;
    try {
        [pub] = await db
            .select({
                id: publications.id,
                slug: publications.slug,
                name: publications.name,
                description: publications.description,
                isPrimary: publications.isPrimary,
            })
            .from(publications)
            .where(eq(publications.slug, publicationSlug));
    } catch {
        pub = undefined;
    }

    if (!pub) {
        return new Response("Not found", {
            status: 404,
            headers: { "Content-Type": "text/plain; charset=utf-8" },
        });
    }

    // The primary stream also owns legacy NULL-publicationId issues.
    const publicationWhere = pub.isPrimary
        ? or(eq(newsletters.publicationId, pub.id), isNull(newsletters.publicationId))
        : eq(newsletters.publicationId, pub.id);

    let items: Array<{
        slug: string | null;
        subject: string;
        preheader: string | null;
        html: string;
        sentAt: Date | null;
        createdAt: Date;
    }> = [];

    try {
        items = await db
            .select({
                slug: newsletters.slug,
                subject: newsletters.subject,
                preheader: newsletters.preheader,
                html: newsletters.html,
                sentAt: newsletters.sentAt,
                createdAt: newsletters.createdAt,
            })
            .from(newsletters)
            .where(and(eq(newsletters.status, "sent"), publicationWhere))
            .orderBy(desc(newsletters.sentAt), desc(newsletters.createdAt))
            .limit(50);
    } catch {
        items = [];
    }

    const feedUrl = `${APP_URL}/${pub.slug}/feed.xml`;
    const channelTitle = `${SITE_TITLE} — ${pub.name}`;
    const channelDescription =
        pub.description ??
        `${pub.name} — a publication from ${SITE_TITLE}. A weekly newsletter for developers.`;
    const lastBuild = items[0]?.sentAt ?? items[0]?.createdAt ?? new Date();

    const rssItems = items
        .filter((item) => item.slug)
        .map((item) => {
            const url = `${APP_URL}/issues/${item.slug}`;
            const pubDate = (item.sentAt ?? item.createdAt).toUTCString();
            const description = item.preheader ?? item.subject;
            return `    <item>
      <title>${escapeXml(item.subject)}</title>
      <link>${url}</link>
      <guid isPermaLink="true">${url}</guid>
      <pubDate>${pubDate}</pubDate>
      <description>${escapeXml(description)}</description>
      <content:encoded><![CDATA[${item.html}]]></content:encoded>
      <dc:creator>${escapeXml(AUTHOR)}</dc:creator>
    </item>`;
        })
        .join("\n");

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(channelTitle)}</title>
    <link>${APP_URL}</link>
    <description>${escapeXml(channelDescription)}</description>
    <language>en-us</language>
    <lastBuildDate>${lastBuild.toUTCString()}</lastBuildDate>
    <atom:link href="${feedUrl}" rel="self" type="application/rss+xml" />
${rssItems}
  </channel>
</rss>`;

    return new Response(xml, {
        headers: {
            "Content-Type": "application/rss+xml; charset=utf-8",
            "Cache-Control": "public, max-age=3600, s-maxage=3600",
        },
    });
}
