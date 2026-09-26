import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { subscribers } from "@/db/schemas/subscribers";
import { eq } from "drizzle-orm";
import { verifySubscriberToken } from "@/lib/subscriber-token";

// RFC 8058 one-click unsubscribe endpoint.
//
// Gmail/Yahoo bulk-sender rules require every marketing/newsletter email to
// carry a `List-Unsubscribe` header AND a `List-Unsubscribe-Post:
// List-Unsubscribe=One-Click` header. When those are present, the mail client
// shows a native "Unsubscribe" affordance and, on click, sends a POST to the
// URL in `List-Unsubscribe` WITHOUT any human interaction. This route is that
// POST target: it verifies the signed subscriber token (proving ownership of
// exactly one row) and flips the subscriber to "unsubscribed" — no page, no
// confirmation click, no login.
//
// The token is the SAME long-lived (30d) signed "unsub"/"prefs" token used by
// the visible /unsubscribe page, so a single link works for both the header
// one-click flow and the human-facing page.

async function unsubscribeByToken(token: string): Promise<{ ok: true } | { ok: false; status: number }> {
    if (!token) return { ok: false, status: 400 };
    let payload;
    try {
        payload = await verifySubscriberToken(token);
    } catch {
        return { ok: false, status: 400 };
    }
    // Accept both a dedicated "unsub" token and a "prefs" token (both prove
    // ownership of this exact row), matching the tRPC unsubscribe mutation.
    if (payload.scope !== "unsub" && payload.scope !== "prefs") {
        return { ok: false, status: 400 };
    }
    await db
        .update(subscribers)
        .set({ status: "unsubscribed", unsubscribedAt: new Date() })
        .where(eq(subscribers.id, payload.subId));
    return { ok: true };
}

// One-click POST (RFC 8058). Mail clients POST here with the token in the query
// string (the URL we put in the List-Unsubscribe header). Some clients send an
// empty `application/x-www-form-urlencoded` body containing
// `List-Unsubscribe=One-Click`; we don't require it — the signed token alone
// authorizes the action.
export async function POST(req: Request): Promise<NextResponse> {
    const url = new URL(req.url);
    const token = url.searchParams.get("token") ?? "";
    const result = await unsubscribeByToken(token);
    if (!result.ok) {
        return NextResponse.json({ ok: false, error: "invalid_or_missing_token" }, { status: result.status });
    }
    return NextResponse.json({ ok: true });
}

// A GET on the same URL is a graceful fallback: a few older clients (and users
// who paste the link) may follow it as a normal link. Redirect them to the
// human-facing /unsubscribe page carrying the token so the experience is
// coherent either way.
export async function GET(req: Request): Promise<NextResponse> {
    const url = new URL(req.url);
    const token = url.searchParams.get("token") ?? "";
    const redirectTo = new URL("/unsubscribe", url.origin);
    if (token) redirectTo.searchParams.set("token", token);
    return NextResponse.redirect(redirectTo, 302);
}
