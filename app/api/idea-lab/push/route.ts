import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { ideas } from "@/db/schemas/ideas";

// Idea Lab push endpoint — the startup-idea research bot POSTs scored ideas here
// and they appear in Luke's private Idea Lab for thumbs up/down.
//
//   POST /api/idea-lab/push
//   Authorization: Bearer <IDEA_LAB_PUSH_SECRET>
//   Content-Type: application/json
//   Single idea:  { "title", "pitch", "whyNow"?, "score"?, "source"?, "raw"? }
//   Or a batch:   { "ideas": [ {…}, {…} ] }
//
// This is a PRIVATE internal endpoint, not part of the public API. It only
// writes rows; it never reads/returns idea content. Gated by a single shared
// secret (IDEA_LAB_PUSH_SECRET) so only Tessie's research bot can push.

function json(status: number, body: Record<string, unknown>) {
    return NextResponse.json(body, { status });
}

type IdeaInput = {
    title?: unknown;
    pitch?: unknown;
    whyNow?: unknown;
    score?: unknown;
    source?: unknown;
    raw?: unknown;
};

function normalize(input: IdeaInput): {
    id: string;
    title: string;
    pitch: string;
    whyNow: string | null;
    score: number | null;
    source: string | null;
    raw: unknown;
} | null {
    const title = typeof input.title === "string" ? input.title.trim() : "";
    const pitch = typeof input.pitch === "string" ? input.pitch.trim() : "";
    if (!title || !pitch) return null; // both required
    const scoreNum =
        typeof input.score === "number" && Number.isFinite(input.score)
            ? Math.round(input.score)
            : null;
    return {
        id: crypto.randomUUID(),
        title: title.slice(0, 300),
        pitch: pitch.slice(0, 20000),
        whyNow:
            typeof input.whyNow === "string" && input.whyNow.trim()
                ? input.whyNow.trim().slice(0, 5000)
                : null,
        score: scoreNum,
        source:
            typeof input.source === "string" && input.source.trim()
                ? input.source.trim().slice(0, 200)
                : null,
        raw: input.raw ?? null,
    };
}

export async function POST(request: Request) {
    // Shared-secret auth. If the secret isn't configured, refuse (never open).
    const secret = process.env.IDEA_LAB_PUSH_SECRET;
    if (!secret) {
        return json(503, { error: "Idea Lab push is not configured." });
    }
    const authz = request.headers.get("authorization") ?? "";
    const m = /^Bearer\s+(.+)$/i.exec(authz.trim());
    if (!m || m[1].trim() !== secret) {
        return json(401, { error: "Unauthorized" });
    }

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return json(400, { error: "Invalid JSON body" });
    }

    const list: IdeaInput[] = Array.isArray((body as any)?.ideas)
        ? (body as any).ideas
        : [body as IdeaInput];

    if (list.length === 0) return json(400, { error: "No ideas provided" });
    if (list.length > 50) return json(400, { error: "Too many ideas (max 50 per push)" });

    const rows = list.map(normalize).filter((r): r is NonNullable<typeof r> => r !== null);
    if (rows.length === 0) {
        return json(400, { error: "Each idea needs a non-empty title and pitch." });
    }

    await db.insert(ideas).values(rows);

    return json(201, { inserted: rows.length, skipped: list.length - rows.length });
}
