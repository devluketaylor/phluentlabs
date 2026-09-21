/**
 * Pure, dependency-free pre-send "quality" analysis for a newsletter issue.
 *
 * Runs entirely over the issue HTML + preheader — no DB, no network — so it can
 * power an inline lint panel in the editor without any tRPC round-trip. Shared
 * word-count / reading-time math matches the public issue pages (220 wpm).
 *
 * NOTE ON UNSUBSCRIBE: the unsubscribe link (and the "just reply / feedback"
 * footer) are AUTO-INJECTED by the send layer (`lib/send-newsletter.ts`) at
 * send time — they are NOT authored into the issue body. So we deliberately do
 * NOT flag "missing unsubscribe link" here; that would be a false positive.
 */

export type LintSeverity = "warn" | "info";

export type LintIssue = {
    id: string;
    severity: LintSeverity;
    message: string;
};

export type IssueLintResult = {
    wordCount: number;
    readingMinutes: number;
    linkCount: number;
    imageCount: number;
    imagesMissingAlt: number;
    emptyLinkCount: number;
    hasPreheader: boolean;
    issues: LintIssue[];
};

const WORDS_PER_MINUTE = 220;

/** Strip tags and collapse whitespace to get readable text. */
function toText(html: string): string {
    return html
        .replace(/<[^>]*>/g, " ")
        .replace(/&nbsp;/gi, " ")
        .replace(/\s+/g, " ")
        .trim();
}

/** Extract every `<a ...>` tag's href (may be undefined/empty). */
function extractLinks(html: string): Array<{ href: string | null; tag: string }> {
    const out: Array<{ href: string | null; tag: string }> = [];
    const re = /<a\b([^>]*)>/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) {
        const attrs = m[1] ?? "";
        const hrefMatch = attrs.match(/\bhref\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i);
        const href = hrefMatch ? (hrefMatch[2] ?? hrefMatch[3] ?? hrefMatch[4] ?? "").trim() : null;
        out.push({ href: href && href.length ? href : null, tag: m[0] });
    }
    return out;
}

/** Extract every `<img ...>` tag and whether it has a non-empty alt. */
function extractImages(html: string): Array<{ hasAlt: boolean }> {
    const out: Array<{ hasAlt: boolean }> = [];
    const re = /<img\b([^>]*)>/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) {
        const attrs = m[1] ?? "";
        const altMatch = attrs.match(/\balt\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i);
        const alt = altMatch ? (altMatch[2] ?? altMatch[3] ?? altMatch[4] ?? "").trim() : "";
        out.push({ hasAlt: alt.length > 0 });
    }
    return out;
}

/**
 * Analyze an issue for pre-send quality signals. Pure — safe to call on every
 * keystroke (it's cheap, but callers may debounce/memoize anyway).
 */
export function lintIssue(input: { html: string; preheader?: string | null }): IssueLintResult {
    const html = input.html ?? "";
    const preheader = (input.preheader ?? "").trim();

    const text = toText(html);
    const words = text.length ? text.split(/\s+/).filter(Boolean) : [];
    const wordCount = words.length;
    const readingMinutes = Math.max(1, Math.round(wordCount / WORDS_PER_MINUTE));

    const links = extractLinks(html);
    const linkCount = links.length;
    const emptyLinks = links.filter(
        (l) => l.href === null || l.href === "#" || /^javascript:/i.test(l.href),
    );
    const emptyLinkCount = emptyLinks.length;

    const images = extractImages(html);
    const imageCount = images.length;
    const imagesMissingAlt = images.filter((i) => !i.hasAlt).length;

    const hasPreheader = preheader.length > 0;

    const issues: LintIssue[] = [];

    // Empty body — nothing to send.
    if (wordCount === 0) {
        issues.push({
            id: "empty-body",
            severity: "warn",
            message: "The body is empty — add content before sending.",
        });
    } else if (wordCount < 40) {
        issues.push({
            id: "very-short",
            severity: "info",
            message: `Only ${wordCount} words — this reads very short for an issue.`,
        });
    }

    if (!hasPreheader) {
        issues.push({
            id: "no-preheader",
            severity: "warn",
            message: "No preheader set — email clients show a preview snippet from the body instead.",
        });
    }

    if (emptyLinkCount > 0) {
        issues.push({
            id: "empty-links",
            severity: "warn",
            message:
                emptyLinkCount === 1
                    ? "1 link has no destination (empty, \u201c#\u201d, or javascript:). Fix or remove it."
                    : `${emptyLinkCount} links have no destination (empty, \u201c#\u201d, or javascript:). Fix or remove them.`,
        });
    }

    if (imagesMissingAlt > 0) {
        issues.push({
            id: "img-alt",
            severity: "info",
            message:
                imagesMissingAlt === 1
                    ? "1 image is missing alt text (hurts accessibility + shows nothing when images are blocked)."
                    : `${imagesMissingAlt} images are missing alt text (hurts accessibility + show nothing when images are blocked).`,
        });
    }

    return {
        wordCount,
        readingMinutes,
        linkCount,
        imageCount,
        imagesMissingAlt,
        emptyLinkCount,
        hasPreheader,
        issues,
    };
}
