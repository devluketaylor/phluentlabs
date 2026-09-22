import { NextResponse } from "next/server";

// Permissive CORS for the public, read-only portfolio API. These endpoints
// expose only PUBLISHED portfolio content (no PII, no secrets), so allowing any
// origin to GET them is fine — the portfolio site fetches them cross-origin.
// Only GET/OPTIONS are ever handled by these routes; there is no write surface.
export const PORTFOLIO_CORS_HEADERS: Record<string, string> = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
};

export function portfolioJson(body: unknown, init?: { status?: number; revalidateSeconds?: number }) {
    const res = NextResponse.json(body, { status: init?.status ?? 200 });
    for (const [k, v] of Object.entries(PORTFOLIO_CORS_HEADERS)) res.headers.set(k, v);
    // Let the CDN cache published content briefly; edits go live within a minute.
    const s = init?.revalidateSeconds ?? 60;
    res.headers.set("Cache-Control", `public, s-maxage=${s}, stale-while-revalidate=${s * 5}`);
    return res;
}

export function portfolioPreflight() {
    return new NextResponse(null, { status: 204, headers: PORTFOLIO_CORS_HEADERS });
}
