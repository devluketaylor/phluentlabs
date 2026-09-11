import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { newsletters } from "@/db/schemas/newsletters";
import { shareClicks } from "@/db/schemas/share-clicks";
import { and, eq, or } from "drizzle-orm";

// Lightweight share-click beacon for the public /issues/[slug] archive pages.
// The issue share row fires a POST here when a reader taps X / LinkedIn /
// copy-link; we count it as a share for that issue + channel.
//
// Privacy: we read NO IP and store NO user-agent. The UA is only inspected
// transiently to filter obvious bots — it is never persisted. The only
// persisted dimension is the platform the reader chose.

const ALLOWED_PLATFORMS = new Set(["x", "linkedin", "copy", "other"]);

// Very coarse bot filter — skip obvious crawlers/preview bots so counts reflect
// real shares. Mirrors the page-view beacon's filter. Best-effort, not exhaustive.
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
        let platform: unknown;
        try {
            const body = await request.json();
            slug = body?.slug;
            platform = body?.platform;
        } catch {
            return NextResponse.json({ error: "Invalid body" }, { status: 400 });
        }
        if (typeof slug !== "string" || !slug.trim() || slug.length > 200) {
            return NextResponse.json({ error: "Invalid slug" }, { status: 400 });
        }

        // Normalize the platform to one of our known channels; anything else
        // (or missing) collapses to "other" so the write never fails.
        const normalizedPlatform =
            typeof platform === "string" && ALLOWED_PLATFORMS.has(platform)
                ? platform
                : "other";

        // Only count shares of a PUBLISHED issue that actually exists (accept
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

        await db.insert(shareClicks).values({
            id: crypto.randomUUID(),
            newsletterId: issue.id,
            platform: normalizedPlatform,
        });

        return NextResponse.json({ ok: true });
    } catch (err) {
        // Never let analytics break the reading experience.
        console.error("share-click beacon error", err);
        return NextResponse.json({ ok: false }, { status: 200 });
    }
}
