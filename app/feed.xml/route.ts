import { db } from "@/db/client";
import { newsletters } from "@/db/schemas/newsletters";
import { desc, eq } from "drizzle-orm";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://phluentlabs.com";
const SITE_TITLE = "PhluentLabs";
const SITE_DESCRIPTION =
    "What I'm noticing while building the web — straight to your inbox. A weekly newsletter for developers.";
const AUTHOR = "Luke Taylor";

// Revalidate the feed hourly so newly-sent issues show up without a redeploy.
export const revalidate = 3600;

function escapeXml(unsafe: string): string {
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");
}

export async function GET() {
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
            .where(eq(newsletters.status, "sent"))
            .orderBy(desc(newsletters.sentAt), desc(newsletters.createdAt))
            .limit(50);
    } catch {
        items = [];
    }

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
    <title>${escapeXml(SITE_TITLE)}</title>
    <link>${APP_URL}</link>
    <description>${escapeXml(SITE_DESCRIPTION)}</description>
    <language>en-us</language>
    <lastBuildDate>${lastBuild.toUTCString()}</lastBuildDate>
    <atom:link href="${APP_URL}/feed.xml" rel="self" type="application/rss+xml" />
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
