/**
 * Pure, dependency-free HTML → plain-text conversion for a newsletter issue,
 * plus a small quality lint over the generated text.
 *
 * WHY: every send SHOULD ship a text/plain alternative alongside the HTML part
 * (a well-established deliverability best practice — a missing or junk text
 * part hurts inbox placement and is unreadable in text-only clients / by some
 * spam filters). This module produces the human-readable text an editor can
 * PREVIEW before send, and flags the two common failure modes:
 *   1. a poor text/HTML content ratio (text part is near-empty vs the HTML), and
 *   2. a text version that is essentially just a dump of URLs.
 *
 * Runs entirely over the issue HTML — no DB, no network — so it can power an
 * inline preview + lint in the editor without any tRPC round-trip.
 */

export type PlainTextLintSeverity = "warn" | "info";

export type PlainTextLintIssue = {
    id: string;
    severity: PlainTextLintSeverity;
    message: string;
};

export type PlainTextResult = {
    /** The generated plain-text body (what a text/plain part would contain). */
    text: string;
    /** Word count of the plain text. */
    wordCount: number;
    /** Number of URLs surfaced in the text. */
    urlCount: number;
    /**
     * Fraction of the plain-text characters taken up by raw URLs (0..1). A high
     * value means the text version is mostly link soup rather than readable prose.
     */
    urlCharRatio: number;
    /** Ratio of plain-text length to HTML length (0..1). Low = thin text part. */
    textToHtmlRatio: number;
    issues: PlainTextLintIssue[];
};

/** Block-level tags that should force a line break in the plain-text output. */
const BLOCK_TAGS =
    /<\/(p|div|section|article|header|footer|h[1-6]|ul|ol|table|tr|blockquote|pre|figure|figcaption)>/gi;
const BR_TAG = /<br\s*\/?>/gi;
const LI_OPEN = /<li[^>]*>/gi;
const HEADING_OPEN = /<(h[1-6])[^>]*>/gi;

/** Decode the handful of HTML entities we actually emit / commonly see. */
function decodeEntities(s: string): string {
    return s
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/&lt;/gi, "<")
        .replace(/&gt;/gi, ">")
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'")
        .replace(/&mdash;/gi, "\u2014")
        .replace(/&ndash;/gi, "\u2013")
        .replace(/&hellip;/gi, "\u2026");
}

/**
 * Convert issue HTML to a readable plain-text body. Anchors are rendered as
 * `text (url)` so the destination survives in the text part (matching how a
 * good text/plain alternative reads), links with no distinct text just show
 * the URL, and block elements become line breaks.
 */
export function htmlToPlainText(html: string): string {
    if (!html) return "";
    let s = html;

    // Drop non-content elements entirely.
    s = s.replace(/<style[\s\S]*?<\/style>/gi, " ");
    s = s.replace(/<script[\s\S]*?<\/script>/gi, " ");
    s = s.replace(/<!--[\s\S]*?-->/g, " ");

    // Anchors → "text (href)" (or just the href when text == href / empty).
    s = s.replace(
        /<a\b([^>]*)>([\s\S]*?)<\/a>/gi,
        (_full, attrs: string, inner: string) => {
            const hrefMatch = attrs.match(/\bhref\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i);
            const href = hrefMatch ? (hrefMatch[2] ?? hrefMatch[3] ?? hrefMatch[4] ?? "").trim() : "";
            const innerText = decodeEntities(inner.replace(/<[^>]*>/g, "")).trim();
            if (!href) return innerText;
            if (!innerText || innerText === href) return href;
            return `${innerText} (${href})`;
        },
    );

    // Images → alt text (or nothing) so a text reader isn't left with a gap.
    s = s.replace(/<img\b([^>]*)>/gi, (_full, attrs: string) => {
        const altMatch = attrs.match(/\balt\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i);
        const alt = altMatch ? (altMatch[2] ?? altMatch[3] ?? altMatch[4] ?? "").trim() : "";
        return alt ? `[${alt}]` : "";
    });

    // Structural line breaks.
    s = s.replace(HEADING_OPEN, "\n");
    s = s.replace(LI_OPEN, "\n- ");
    s = s.replace(BR_TAG, "\n");
    s = s.replace(BLOCK_TAGS, "\n");

    // Strip any remaining tags, decode entities.
    s = s.replace(/<[^>]*>/g, "");
    s = decodeEntities(s);

    // Normalize whitespace: collapse runs of spaces/tabs, trim each line, and
    // collapse 3+ blank lines down to a single blank line.
    s = s
        .replace(/[ \t]+/g, " ")
        .split("\n")
        .map((line) => line.trim())
        .join("\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();

    return s;
}

const URL_RE = /\bhttps?:\/\/[^\s)]+/gi;

/**
 * Generate the plain-text version of an issue and lint it for the two common
 * quality problems: a thin text/HTML ratio and a URL-dump text body.
 */
export function analyzePlainText(html: string): PlainTextResult {
    const source = html ?? "";
    const text = htmlToPlainText(source);

    const words = text.length ? text.split(/\s+/).filter(Boolean) : [];
    const wordCount = words.length;

    const urls = text.match(URL_RE) ?? [];
    const urlCount = urls.length;
    const urlChars = urls.reduce((n, u) => n + u.length, 0);
    const urlCharRatio = text.length > 0 ? urlChars / text.length : 0;

    // Compare the text length to the raw HTML length as a rough content-ratio
    // signal. (HTML carries markup overhead, so this is always < 1; a very low
    // value means the text part barely represents the content.)
    const textToHtmlRatio = source.length > 0 ? text.length / source.length : 0;

    const issues: PlainTextLintIssue[] = [];

    if (wordCount === 0 && source.trim().length > 0) {
        issues.push({
            id: "text-empty",
            severity: "warn",
            message:
                "The generated plain-text version is empty — text-only clients and some spam filters would see nothing.",
        });
    }

    // URL-dump: the readable text is mostly raw links (and there are several).
    if (wordCount > 0 && urlCount >= 3 && urlCharRatio >= 0.4) {
        issues.push({
            id: "text-url-dump",
            severity: "warn",
            message:
                "The plain-text version is mostly URLs — add link text so it reads as prose, not link soup.",
        });
    }

    // Thin text part: lots of HTML, very little readable text. Only meaningful
    // once the HTML is non-trivial (avoids nagging on a tiny draft).
    if (source.length >= 400 && wordCount > 0 && textToHtmlRatio < 0.05) {
        issues.push({
            id: "text-thin",
            severity: "info",
            message:
                "The plain-text version is very short relative to the HTML — check it still carries the message.",
        });
    }

    return { text, wordCount, urlCount, urlCharRatio, textToHtmlRatio, issues };
}
