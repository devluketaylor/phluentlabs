/**
 * Pre-send dead-link checking helpers.
 *
 * The client-side lint (`lib/issue-lint.ts`) already flags STRUCTURALLY dead
 * links (empty href / "#" / javascript:) with zero network. This module powers
 * an OPTIONAL, on-demand "check links" action that actually pings each external
 * destination server-side (so no browser CORS wall) and reports 4xx/5xx/timeout
 * failures before an issue goes out.
 *
 * Everything here is pure/dependency-free except `pingLink`, which does the
 * network I/O — kept small + bounded (HEAD → GET fallback, hard timeout).
 */

/** Max distinct external URLs we'll ever ping in one check (abuse/cost cap). */
export const MAX_LINKS_TO_CHECK = 30;

/** Per-request network timeout for a single link (ms). */
export const LINK_TIMEOUT_MS = 8_000;

export type LinkCheckStatus = "ok" | "broken" | "warn" | "skipped";

export type LinkCheckResult = {
    url: string;
    status: LinkCheckStatus;
    /** HTTP status code when we got a response. */
    httpStatus?: number;
    /** Short human-readable reason (e.g. "timeout", "404 Not Found", "DNS"). */
    detail: string;
};

/**
 * Extract the set of distinct, HTTP(S) hrefs from issue HTML worth pinging.
 *
 * Deliberately excludes:
 *  - mailto:/tel:/javascript: and empty/"#" (those are the client-lint's job)
 *  - relative links + our own auto-injected unsubscribe/tracking (they resolve
 *    at send time, not something the editor can "fix" here)
 *  - obvious tracking/pixel-ish and merge-tag URLs
 *
 * Returns URLs in first-seen order, de-duplicated, capped by the caller.
 */
export function extractCheckableLinks(html: string): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    const re = /<a\b([^>]*)>/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) {
        const attrs = m[1] ?? "";
        const hrefMatch = attrs.match(/\bhref\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i);
        if (!hrefMatch) continue;
        const rawHref = (hrefMatch[2] ?? hrefMatch[3] ?? hrefMatch[4] ?? "").trim();
        if (!rawHref) continue;

        // Decode a couple of common HTML entities so the URL is pingable.
        const href = rawHref.replace(/&amp;/gi, "&").trim();

        // Only http(s) absolute URLs — skip mailto/tel/javascript/#/relative.
        if (!/^https?:\/\//i.test(href)) continue;
        // Skip merge-tag-ish / templated URLs we can't resolve.
        if (/[{}]/.test(href)) continue;

        // Normalize for de-dupe (drop a trailing #fragment; keep query).
        const normalized = href.split("#")[0];
        if (!normalized) continue;
        if (seen.has(normalized)) continue;
        seen.add(normalized);
        out.push(normalized);
    }
    return out;
}

/** Classify an HTTP status code into a link-check status. */
function classifyStatus(code: number): { status: LinkCheckStatus; detail: string } {
    if (code >= 200 && code < 400) return { status: "ok", detail: `${code}` };
    if (code === 401 || code === 403) {
        // Many sites block bots/HEAD with 401/403 even though the link is fine
        // for a human — surface as a soft warning, not a hard break.
        return { status: "warn", detail: `${code} (blocked to bots — may be fine)` };
    }
    if (code === 405 || code === 429) {
        return { status: "warn", detail: `${code} (server refused the check — may be fine)` };
    }
    if (code >= 400 && code < 500) return { status: "broken", detail: `${code}` };
    if (code >= 500) return { status: "broken", detail: `${code} server error` };
    return { status: "warn", detail: `${code}` };
}

/**
 * Ping a single URL. Tries HEAD first (cheap), falls back to a ranged GET if
 * HEAD is unsupported (405) or the response looks unhelpful. Bounded by a hard
 * timeout. Never throws — always resolves to a `LinkCheckResult`.
 */
export async function pingLink(url: string): Promise<LinkCheckResult> {
    const attempt = async (method: "HEAD" | "GET"): Promise<Response | { error: string }> => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), LINK_TIMEOUT_MS);
        try {
            const res = await fetch(url, {
                method,
                redirect: "follow",
                signal: controller.signal,
                headers: {
                    // Present as a normal browser to reduce false 403s.
                    "user-agent":
                        "Mozilla/5.0 (compatible; phluentlabs-linkcheck/1.0; +https://phluentlabs.com)",
                    accept: "*/*",
                    // Only pull the first bytes on GET fallback.
                    ...(method === "GET" ? { range: "bytes=0-0" } : {}),
                },
            });
            return res;
        } catch (err) {
            const name = err instanceof Error ? err.name : "";
            if (name === "AbortError") return { error: "timeout" };
            const msg = err instanceof Error ? err.message : String(err);
            // Common node fetch failure shapes → friendlier detail.
            if (/getaddrinfo|ENOTFOUND|EAI_AGAIN/i.test(msg)) return { error: "DNS — host not found" };
            if (/ECONNREFUSED/i.test(msg)) return { error: "connection refused" };
            if (/certificate|self.signed|SSL|TLS/i.test(msg)) return { error: "TLS/certificate error" };
            return { error: "unreachable" };
        } finally {
            clearTimeout(timer);
        }
    };

    let res = await attempt("HEAD");
    // If HEAD failed at the network level, don't bother with GET (same host).
    if ("error" in res) {
        return { url, status: "broken", detail: res.error };
    }
    // Some servers reject HEAD with 405 — retry with a ranged GET.
    if (res.status === 405 || res.status === 501) {
        const getRes = await attempt("GET");
        if ("error" in getRes) return { url, status: "broken", detail: getRes.error };
        res = getRes;
    }

    const { status, detail } = classifyStatus(res.status);
    return { url, status, httpStatus: res.status, detail };
}

/**
 * Ping a batch of URLs with a small concurrency cap. Pure orchestration over
 * `pingLink`; never throws.
 */
export async function checkLinks(
    urls: string[],
    opts: { concurrency?: number } = {},
): Promise<LinkCheckResult[]> {
    const concurrency = Math.max(1, Math.min(6, opts.concurrency ?? 4));
    const results: LinkCheckResult[] = new Array(urls.length);
    let cursor = 0;
    async function worker() {
        while (cursor < urls.length) {
            const i = cursor++;
            results[i] = await pingLink(urls[i]);
        }
    }
    const workers = Array.from({ length: Math.min(concurrency, urls.length) }, () => worker());
    await Promise.all(workers);
    return results;
}
