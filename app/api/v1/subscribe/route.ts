import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { apiKeys } from "@/db/schemas/api-keys";
import { eq } from "drizzle-orm";
import { hashApiKey } from "@/lib/api-key";
import { subscribeCore } from "@/lib/subscribe-core";

// Public subscribe API v1.
//
//   POST /api/v1/subscribe
//   Authorization: Bearer <api key>
//   Content-Type: application/json
//   { "email": "a@b.com", "firstName": "A", "lastName": "B",
//     "ref": "<referral code>", "tags": ["source:partner"] }
//
// Lets external sites/tools enroll people programmatically. Reuses the exact
// same subscribe flow as the on-site form (subscribeCore) — same confirm email,
// same referral handling, same dedupe. Double opt-in is preserved: the person
// still has to click the confirm link, so this can't be used to force-confirm.

// ── Tiny in-memory rate limiter (per key + per IP) ────────────────────────
// Best-effort abuse guard for a single server instance. Not a substitute for
// an edge/WAF limiter, but keeps a leaked key from hammering the confirm flow.
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 30;
const hits = new Map<string, { count: number; resetAt: number }>();

function rateLimited(key: string): boolean {
    const now = Date.now();
    const entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
        hits.set(key, { count: 1, resetAt: now + WINDOW_MS });
        return false;
    }
    entry.count += 1;
    return entry.count > MAX_PER_WINDOW;
}

function json(status: number, body: Record<string, unknown>) {
    return NextResponse.json(body, { status });
}

function isValidEmail(v: unknown): v is string {
    return typeof v === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()) && v.length <= 320;
}

export async function POST(request: Request) {
    // 1) Bearer auth.
    const authz = request.headers.get("authorization") ?? "";
    const m = /^Bearer\s+(.+)$/i.exec(authz.trim());
    if (!m) {
        return json(401, { error: "Missing or malformed Authorization header. Use: Authorization: Bearer <api key>" });
    }
    const rawKey = m[1].trim();
    if (!rawKey) return json(401, { error: "Empty API key" });

    // Look the key up by its hash — the raw key is never compared directly and
    // never logged. A single indexed unique lookup on the hash.
    const keyHash = await hashApiKey(rawKey);
    const [keyRow] = await db
        .select({ id: apiKeys.id, revokedAt: apiKeys.revokedAt })
        .from(apiKeys)
        .where(eq(apiKeys.keyHash, keyHash));

    if (!keyRow || keyRow.revokedAt) {
        // Same generic message for unknown + revoked so we don't leak which.
        return json(401, { error: "Invalid API key" });
    }

    // 2) Rate limit (per key primarily; IP as a secondary bucket).
    const ip =
        request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
        request.headers.get("x-real-ip") ||
        "unknown";
    if (rateLimited(`k:${keyRow.id}`) || rateLimited(`ip:${ip}`)) {
        return json(429, { error: "Rate limit exceeded. Try again shortly." });
    }

    // 3) Parse + validate body.
    let body: any;
    try {
        body = await request.json();
    } catch {
        return json(400, { error: "Invalid JSON body" });
    }
    if (!body || typeof body !== "object") {
        return json(400, { error: "Body must be a JSON object" });
    }
    if (!isValidEmail(body.email)) {
        return json(400, { error: "A valid `email` is required" });
    }
    const firstName =
        typeof body.firstName === "string" && body.firstName.trim() ? body.firstName.trim().slice(0, 200) : undefined;
    const lastName =
        typeof body.lastName === "string" && body.lastName.trim() ? body.lastName.trim().slice(0, 200) : undefined;
    const ref = typeof body.ref === "string" && body.ref.trim() ? body.ref.trim().slice(0, 32) : undefined;
    const tags = Array.isArray(body.tags)
        ? body.tags.filter((t: unknown) => typeof t === "string")
        : undefined;

    // 4) Run the shared subscribe flow.
    try {
        const result = await subscribeCore(db, { email: body.email, firstName, lastName, ref, tags });

        // Best-effort: record last-used (don't fail the request if it errors).
        db.update(apiKeys)
            .set({ lastUsedAt: new Date() })
            .where(eq(apiKeys.id, keyRow.id))
            .catch(() => {});

        return json(200, {
            ok: true,
            alreadySubscribed: result.alreadySubscribed,
            // Double opt-in: a confirmation email was (re)sent unless already subscribed.
            message: result.alreadySubscribed
                ? "This email is already subscribed."
                : "Subscription pending — a confirmation email has been sent.",
        });
    } catch (err) {
        console.error("[api/v1/subscribe] error", err);
        return json(500, { error: "Subscription failed. Please try again." });
    }
}
