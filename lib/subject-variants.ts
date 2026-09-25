// Pure client-side subject-line variant scaffolds.
//
// Given a "Subject A" the editor already wrote, we mechanically transform it
// into a few alternate framings the editor can one-click drop into "Subject B"
// to actually run an A/B subject-line test. These are deterministic string
// transforms — NO model call (that's the Tier 11/15 "bigger bet"). The point is
// to remove the friction of inventing a second subject from scratch so more
// issues get A/B tested.

export type SubjectVariantKind = "question" | "number" | "curiosity";

export type SubjectVariant = {
    kind: SubjectVariantKind;
    /** Short human label for the button. */
    label: string;
    /** One-line hint about the framing. */
    hint: string;
    /** The generated alternate subject. */
    value: string;
};

/** Trim + collapse whitespace + strip a trailing sentence-ending punctuation run. */
function clean(subject: string): string {
    return subject.replace(/\s+/g, " ").trim();
}

/** Drop a single trailing period/exclamation/question mark (keep the words). */
function stripTrailingPunct(s: string): string {
    return s.replace(/[.!?]+$/u, "").trim();
}

/** Lowercase the first character (for splicing mid-sentence) unless it looks like an acronym/proper token. */
function lcFirst(s: string): string {
    if (!s) return s;
    // Don't lowercase if the first word is ALL-CAPS (likely acronym) or has an internal cap (e.g. "GitHub", "iOS").
    const firstWord = s.split(" ", 1)[0] ?? "";
    if (firstWord.length > 1 && firstWord === firstWord.toUpperCase()) return s;
    if (/[A-Z]/.test(firstWord.slice(1))) return s;
    return s.charAt(0).toLowerCase() + s.slice(1);
}

/** Question-form framing: turn a statement into a curiosity question. */
function toQuestion(base: string): string {
    const core = stripTrailingPunct(base);
    if (!core) return "";
    // If it already reads like a question, keep it but ensure the mark.
    if (core.endsWith("?")) return core;
    return `What if ${lcFirst(core)}?`;
}

/** Number / benefit-forward framing: lead with a concrete count-style hook. */
function toNumber(base: string): string {
    const core = stripTrailingPunct(base);
    if (!core) return "";
    return `3 takeaways: ${core}`;
}

/** Curiosity-gap framing: tease without giving it all away. */
function toCuriosity(base: string): string {
    const core = stripTrailingPunct(base);
    if (!core) return "";
    return `The thing about ${lcFirst(core)}`;
}

/**
 * Build variant scaffolds from Subject A. Returns [] when A is blank.
 * De-dupes against A itself and against each other (case-insensitive) so we
 * never offer a "variant" identical to what's already typed.
 */
export function buildSubjectVariants(subjectA: string): SubjectVariant[] {
    const base = clean(subjectA);
    if (!base) return [];

    const candidates: SubjectVariant[] = [
        {
            kind: "question",
            label: "Question",
            hint: "Reframe as a curiosity question",
            value: toQuestion(base),
        },
        {
            kind: "number",
            label: "Number / benefit",
            hint: "Lead with a concrete takeaway count",
            value: toNumber(base),
        },
        {
            kind: "curiosity",
            label: "Curiosity gap",
            hint: "Tease without giving it away",
            value: toCuriosity(base),
        },
    ];

    const seen = new Set<string>([base.toLowerCase()]);
    const out: SubjectVariant[] = [];
    for (const c of candidates) {
        const v = clean(c.value);
        const key = v.toLowerCase();
        if (!v || seen.has(key)) continue;
        seen.add(key);
        out.push({ ...c, value: v });
    }
    return out;
}
