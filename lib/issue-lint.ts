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
    /** Number of distinct spam-trigger signals detected (subject + body). */
    spamSignalCount: number;
    issues: LintIssue[];
};

const WORDS_PER_MINUTE = 220;

/**
 * Common spam-filter trigger phrases (case-insensitive, word-boundary). Kept
 * intentionally conservative + developer-newsletter-appropriate so we don't
 * cry wolf on legitimate copy. These are the phrases spam classifiers (and
 * Gmail's promotions heuristics) weight most heavily.
 */
const SPAM_TRIGGER_PHRASES: readonly string[] = [
    "act now",
    "limited time",
    "click here",
    "buy now",
    "order now",
    "free money",
    "risk[- ]?free",
    "100% free",
    "guaranteed",
    "no obligation",
    "cash bonus",
    "earn \\$",
    "make money",
    "double your",
    "winner",
    "congratulations you",
    "you have been selected",
    "this is not spam",
    "viagra",
    "weight loss",
    "work from home",
    "miracle",
    "lowest price",
    "best price",
    "urgent",
    "apply now",
    "call now",
];

/** Count emoji-ish codepoints in a string (rough, pictographic ranges). */
function countEmoji(s: string): number {
    // Pictographic + symbol ranges commonly used as emoji; deliberately rough.
    const re =
        /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}\u{FE00}-\u{FE0F}\u{1F1E6}-\u{1F1FF}]/gu;
    const m = s.match(re);
    return m ? m.length : 0;
}

/** Fraction of alphabetic characters that are uppercase (0..1). */
function uppercaseRatio(s: string): number {
    const letters = s.replace(/[^a-zA-Z]/g, "");
    if (letters.length === 0) return 0;
    const upper = letters.replace(/[^A-Z]/g, "").length;
    return upper / letters.length;
}

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
export function lintIssue(input: {
    html: string;
    preheader?: string | null;
    subject?: string | null;
}): IssueLintResult {
    const html = input.html ?? "";
    const preheader = (input.preheader ?? "").trim();
    const subject = (input.subject ?? "").trim();

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

    // --- Deliverability / spam-trigger signals (subject + body) -------------
    // Only surfaced as "info" nudges (not hard warnings): they're heuristics,
    // and a couple of matches on a real developer newsletter is usually fine.
    let spamSignalCount = 0;
    const haystack = `${subject} ${text}`.toLowerCase();
    const matchedPhrases: string[] = [];
    for (const phrase of SPAM_TRIGGER_PHRASES) {
        const re = new RegExp(`(^|[^a-z0-9])(${phrase})([^a-z0-9]|$)`, "i");
        if (re.test(haystack)) {
            spamSignalCount += 1;
            // Recover a clean label from the pattern for display.
            matchedPhrases.push(phrase.replace(/\\/g, "").replace(/\[- ?\]\??/g, " ").trim());
        }
    }
    if (matchedPhrases.length > 0) {
        const preview = matchedPhrases.slice(0, 3).map((p) => `\u201c${p}\u201d`).join(", ");
        const extra = matchedPhrases.length > 3 ? ` +${matchedPhrases.length - 3} more` : "";
        issues.push({
            id: "spam-phrases",
            severity: matchedPhrases.length >= 3 ? "warn" : "info",
            message: `Spam-trigger phrasing detected (${preview}${extra}) — common phrases can nudge you into Promotions/Spam.`,
        });
    }

    // ALL-CAPS subject (only meaningful for a subject with a few real words).
    if (subject.length >= 8 && uppercaseRatio(subject) >= 0.7) {
        spamSignalCount += 1;
        issues.push({
            id: "subject-caps",
            severity: "info",
            message: "Subject is nearly ALL CAPS — reads as shouty and can hurt deliverability.",
        });
    }

    // Excessive punctuation in the subject (!!! / ??? / mixed !?!).
    if (/[!?]{2,}/.test(subject)) {
        spamSignalCount += 1;
        issues.push({
            id: "subject-punct",
            severity: "info",
            message: "Repeated “!” or “?” in the subject looks spammy — one is plenty.",
        });
    }

    // Money-shout ($$$) anywhere in subject/body.
    if (/\${2,}/.test(`${subject} ${text}`)) {
        spamSignalCount += 1;
        issues.push({
            id: "money-shout",
            severity: "info",
            message: "Multiple “$” in a row ($$$) is a classic spam flag.",
        });
    }

    // Emoji overload in the subject (a couple is fine; a pile is a flag).
    const subjectEmoji = countEmoji(subject);
    if (subjectEmoji >= 4) {
        spamSignalCount += 1;
        issues.push({
            id: "subject-emoji",
            severity: "info",
            message: `${subjectEmoji} emoji in the subject — trim to 1\u20132 so it doesn\u2019t read as spam.`,
        });
    }

    // Faked reply/forward prefix in the subject (Re:/Fwd: with no real thread).
    if (/^\s*(re|fwd?)\s*:/i.test(subject)) {
        spamSignalCount += 1;
        issues.push({
            id: "subject-fake-reply",
            severity: "warn",
            message: "Subject starts with “Re:”/“Fwd:” — faking a reply erodes trust and trips spam filters.",
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
        spamSignalCount,
        issues,
    };
}
