// Referral reward-tier milestones.
//
// Builds on the existing referral backend (lib/referral.ts + the
// subscribers.referralCode / referredBy columns): given a subscriber's count
// of CONFIRMED referrals, compute which named reward tier they've unlocked and
// how far they are from the next one. This is presentation/progress logic only
// — there is NO automatic reward fulfilment here (rewards are delivered
// manually / externally by Luke).
//
// PRODUCT NOTE (dev-loop call, 2026-09-10): the thresholds and reward copy
// below are sensible DEFAULTS chosen by the dev loop, not a final product
// decision. Luke can adjust the tier count, thresholds, names, or reward text
// at any time — everything downstream (queries + UI) reads from this single
// source of truth, so editing this array is the only change required.

export type ReferralTier = {
    /** Confirmed-referral count required to unlock this tier. */
    threshold: number;
    /** Short internal key (stable identifier for a tier). */
    key: string;
    /** Display name of the tier / badge. */
    name: string;
    /** Human-readable reward description shown to the subscriber. */
    reward: string;
};

// Ordered ascending by threshold. Threshold 0 is the implicit "starting"
// state (no tier unlocked) and is NOT listed here.
export const REFERRAL_TIERS: ReferralTier[] = [
    {
        threshold: 1,
        key: "supporter",
        name: "Supporter",
        reward: "A shout-out thank-you — you helped grow the list!",
    },
    {
        threshold: 3,
        key: "insider",
        name: "Insider",
        reward: "Early access to new issues before they go out.",
    },
    {
        threshold: 5,
        key: "ambassador",
        name: "Ambassador",
        reward: "Exclusive subscriber-only deep-dive content.",
    },
    {
        threshold: 10,
        key: "legend",
        name: "Legend",
        reward: "A personal thank-you + featured shout-out in an issue.",
    },
];

export type ReferralProgress = {
    /** Confirmed-referral count this progress was computed from. */
    count: number;
    /** Highest tier the subscriber has unlocked, or null if none yet. */
    currentTier: ReferralTier | null;
    /** The next tier to aim for, or null if all tiers are unlocked. */
    nextTier: ReferralTier | null;
    /** Referrals still needed to reach nextTier (0 if none / maxed). */
    toNext: number;
    /**
     * Progress toward the next tier as a 0–100 percentage, measured from the
     * CURRENT tier's threshold to the next tier's threshold. 100 when maxed.
     */
    percentToNext: number;
    /** All tiers with an `unlocked` flag, for rendering a full ladder. */
    tiers: (ReferralTier & { unlocked: boolean })[];
};

/**
 * Compute referral milestone progress from a confirmed-referral count.
 * Pure + side-effect free so it's trivially testable and safe on the server.
 */
export function computeReferralProgress(count: number): ReferralProgress {
    const n = Math.max(0, Math.floor(count || 0));

    let currentTier: ReferralTier | null = null;
    let nextTier: ReferralTier | null = null;

    for (const tier of REFERRAL_TIERS) {
        if (n >= tier.threshold) {
            currentTier = tier;
        } else {
            nextTier = tier;
            break;
        }
    }

    const currentThreshold = currentTier ? currentTier.threshold : 0;
    const toNext = nextTier ? Math.max(0, nextTier.threshold - n) : 0;

    let percentToNext = 100;
    if (nextTier) {
        const span = nextTier.threshold - currentThreshold;
        const done = n - currentThreshold;
        percentToNext = span > 0 ? Math.round((done / span) * 100) : 0;
        percentToNext = Math.min(100, Math.max(0, percentToNext));
    }

    return {
        count: n,
        currentTier,
        nextTier,
        toNext,
        percentToNext,
        tiers: REFERRAL_TIERS.map((t) => ({ ...t, unlocked: n >= t.threshold })),
    };
}
