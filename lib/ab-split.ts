/**
 * A/B subject-line test helpers.
 *
 * When a newsletter defines a second subject (`subjectB`), the audience is
 * split ~50/50 into variant "A" (uses `subject`) and variant "B" (uses
 * `subjectB`). The split is DETERMINISTIC per subscriber id: the same
 * subscriber always lands in the same bucket for a given issue, so re-runs /
 * batching don't reshuffle assignments, and the split stays balanced without
 * needing any shared counter across Resend batches.
 */

export type SubjectVariant = "A" | "B";

/**
 * Deterministically assign a subscriber to variant "A" or "B" for a given
 * newsletter. Hashes `newsletterId:subscriberId` so different issues shuffle
 * independently (a subscriber isn't stuck always getting variant A across
 * every A/B test) while remaining stable within one issue.
 */
export function assignVariant(newsletterId: string, subscriberId: string): SubjectVariant {
    const key = `${newsletterId}:${subscriberId}`;
    // Simple, dependency-free 32-bit FNV-1a hash. We only need a well-mixed
    // low bit for a balanced 50/50 split — not cryptographic strength.
    let hash = 0x811c9dc5;
    for (let i = 0; i < key.length; i++) {
        hash ^= key.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193);
    }
    // Use the low bit of the unsigned hash for the coin flip.
    return (hash >>> 0) % 2 === 0 ? "A" : "B";
}
