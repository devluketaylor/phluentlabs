import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { newsletters } from "@/db/schemas/newsletters";
import { pageViews } from "@/db/schemas/page-views";
import { and, eq, or } from "drizzle-orm";

// Lightweight page-view beacon for the public /issues/[slug] archive pages.
// The issue page fires a POST here once per load; we count it as a web view.
//
// Privacy: we read NO IP and store NO user-agent. The UA is only inspected
// transiently to filter obvious bots, and the Referer only to compute a coarse
// source bucket — neither is persisted.

// Coarse referrer bucket from the (server-visible) Referer header. Keeps zero
// PII: no full URL, no query strings — just a category.
function referrerBucket(referer: string | null, host: string | null): string {
    if (!referer) return "direct";
    let refHost = "";
    try {
        refHost = new URL(referer).hostname.toLowerCase();
    } catch {
        return "other";
    }
    if (host && refHost === host.toLowerCase().split(":")[0]) return "internal";
    if (/(google|bing|duckduckgo|yahoo|yandex|baidu|ecosia|brave)\./.test(refHost)) return "search";
    if (/(t\.co|twitter|x\.com|facebook|fb\.|instagram|linkedin|reddit|news\.ycombinator|ycombinator|mastodon|bsky|bluesky|threads|youtube|pinterest|tiktok)/.test(refHost)) return "social";
    return "other";
}

// Very coarse bot filter — skip obvious crawlers/preview bots so counts reflect
// real reads. This is best-effort, not exhaustive.
function looksLikeBot(ua: string | null): boolean {
    if (!ua) return true; // no UA at all → almost always a bot/script
    return /bot|crawler|spider|crawl|slurp|bingpreview|facebookexternalhit|embedly|quora|pinterest|vkshare|whatsapp|telegram|slack|discordbot|preview|monitor|headless|lighthouse|pagespeed|gtmetrix|semrush|ahrefs|mj12|dotbot|petalbot|applebot|googlebot/i.test(ua);
}

export async function POST(request: Request) {
    try {
        const ua = request.headers.get("user-agent");
        if (looksLikeBot(ua)) {
            // Silently succeed without recording — don't advertise the filter.
            return NextResponse.json({ ok: true });
        }

        let slug: unknown;
        try {
            const body = await request.json();
            slug = body?.slug;
        } catch {
            return NextResponse.json({ error: "Invalid body" }, { status: 400 });
        }
        if (typeof slug !== "string" || !slug.trim() || slug.length > 200) {
            return NextResponse.json({ error: "Invalid slug" }, { status: 400 });
        }

        // Only count views of a PUBLISHED issue that actually exists (accept
        // either slug or id, mirroring the public page's own lookup).
        const [issue] = await db
            .select({ id: newsletters.id })
            .from(newsletters)
            .where(
                and(
                    or(eq(newsletters.slug, slug), eq(newsletters.id, slug)),
                    eq(newsletters.status, "sent"),
                ),
            );
        if (!issue) {
            return NextResponse.json({ ok: true }); // unknown/unpublished → ignore silently
        }

        const bucket = referrerBucket(
            request.headers.get("referer"),
            request.headers.get("host"),
        );

        await db.insert(pageViews).values({
            id: crypto.randomUUID(),
            newsletterId: issue.id,
            referrerBucket: bucket,
        });

        return NextResponse.json({ ok: true });
    } catch (err) {
        // Never let analytics break the reading experience.
        console.error("page-view beacon error", err);
        return NextResponse.json({ ok: false }, { status: 200 });
    }
}
