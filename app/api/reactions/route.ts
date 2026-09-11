import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { newsletters } from "@/db/schemas/newsletters";
import { issueReactions } from "@/db/schemas/issue-reactions";
import { and, count, eq, or } from "drizzle-orm";

// Anonymous one-tap reader feedback ("was this useful?") for the public
// /issues/[slug] archive pages.
//   POST { slug, reaction: "up"|"mid"|"down" } → records one vote for the issue.
//   GET  ?slug=<slug>                          → public aggregate counts so the
//                                                UI can show a running tally.
//
// Privacy: we read NO IP and store NO user-agent. The UA is inspected only
// transiently on POST to filter obvious bots — it is never persisted. The only
// persisted dimension is the coarse reaction the reader chose. Coarse
// per-reader dedupe is done client-side (localStorage), so this is a
// best-effort signal, not a unique-voter tally.

const ALLOWED_REACTIONS = new Set(["up", "mid", "down"]);

// Very coarse bot filter — mirrors the page-view / share beacons. Best-effort.
function looksLikeBot(ua: string | null): boolean {
    if (!ua) return true; // no UA at all → almost always a bot/script
    return /bot|crawler|spider|crawl|slurp|bingpreview|facebookexternalhit|embedly|quora|pinterest|vkshare|whatsapp|telegram|slack|discordbot|preview|monitor|headless|lighthouse|pagespeed|gtmetrix|semrush|ahrefs|mj12|dotbot|petalbot|applebot|googlebot/i.test(ua);
}

// Resolve a slug-or-id to a PUBLISHED issue's id (mirrors the public page + the
// other public beacons). Returns null when it doesn't map to a sent issue.
async function resolvePublishedIssueId(slug: string): Promise<string | null> {
    const [issue] = await db
        .select({ id: newsletters.id })
        .from(newsletters)
        .where(
            and(
                or(eq(newsletters.slug, slug), eq(newsletters.id, slug)),
                eq(newsletters.status, "sent"),
            ),
        );
    return issue?.id ?? null;
}

export async function POST(request: Request) {
    try {
        const ua = request.headers.get("user-agent");
        if (looksLikeBot(ua)) {
            // Silently succeed without recording — don't advertise the filter.
            return NextResponse.json({ ok: true });
        }

        let slug: unknown;
        let reaction: unknown;
        try {
            const body = await request.json();
            slug = body?.slug;
            reaction = body?.reaction;
        } catch {
            return NextResponse.json({ error: "Invalid body" }, { status: 400 });
        }
        if (typeof slug !== "string" || !slug.trim() || slug.length > 200) {
            return NextResponse.json({ error: "Invalid slug" }, { status: 400 });
        }
        if (typeof reaction !== "string" || !ALLOWED_REACTIONS.has(reaction)) {
            return NextResponse.json({ error: "Invalid reaction" }, { status: 400 });
        }

        const issueId = await resolvePublishedIssueId(slug);
        if (!issueId) {
            return NextResponse.json({ ok: true }); // unknown/unpublished → ignore silently
        }

        await db.insert(issueReactions).values({
            id: crypto.randomUUID(),
            newsletterId: issueId,
            reaction,
        });

        return NextResponse.json({ ok: true });
    } catch (err) {
        // Never let analytics break the reading experience.
        console.error("issue-reaction beacon error", err);
        return NextResponse.json({ ok: false }, { status: 200 });
    }
}

export async function GET(request: Request) {
    try {
        const url = new URL(request.url);
        const slug = url.searchParams.get("slug");
        if (!slug || !slug.trim() || slug.length > 200) {
            return NextResponse.json({ error: "Invalid slug" }, { status: 400 });
        }

        const issueId = await resolvePublishedIssueId(slug);
        if (!issueId) {
            // Unknown/unpublished issue → return empty tally rather than leaking.
            return NextResponse.json({ up: 0, mid: 0, down: 0, total: 0 });
        }

        const rows = await db
            .select({ reaction: issueReactions.reaction, c: count() })
            .from(issueReactions)
            .where(eq(issueReactions.newsletterId, issueId))
            .groupBy(issueReactions.reaction);

        const tally = { up: 0, mid: 0, down: 0 };
        for (const r of rows) {
            const key = (r.reaction ?? "mid") as "up" | "mid" | "down";
            if (key in tally) tally[key] += Number(r.c);
        }
        const total = tally.up + tally.mid + tally.down;
        return NextResponse.json({ ...tally, total });
    } catch (err) {
        console.error("issue-reaction counts error", err);
        return NextResponse.json({ up: 0, mid: 0, down: 0, total: 0 });
    }
}
