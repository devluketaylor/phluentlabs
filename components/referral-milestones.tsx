"use client";

import * as React from "react";
import { Award, Lock, Trophy } from "lucide-react";

import type { ReferralProgress } from "@/lib/referral-tiers";

/**
 * ReferralMilestones — renders the reward-tier ladder + progress-to-next for a
 * subscriber's referral count. Presentation only; the progress object is
 * computed server-side (computeReferralProgress) and passed in.
 *
 * Monochrome accent (the `primary` token) marks the current tier and the
 * progress bar; everything else uses theme tokens so it stays clean in light +
 * dark mode.
 */
export function ReferralMilestones({ progress }: { progress: ReferralProgress }) {
    const { currentTier, nextTier, toNext, percentToNext, tiers } = progress;

    return (
        <div className="mt-5 border-t pt-4">
            <div className="flex items-center gap-2 mb-2">
                <Trophy className="size-4 text-primary" />
                <h4 className="text-sm font-semibold">Reward milestones</h4>
            </div>

            {/* Current standing + next-tier nudge */}
            <p className="text-sm text-muted-foreground">
                {currentTier ? (
                    <>
                        You&apos;ve unlocked{" "}
                        <span className="font-semibold text-foreground">
                            {currentTier.name}
                        </span>
                        .
                    </>
                ) : (
                    <>Refer a friend to unlock your first reward.</>
                )}
                {nextTier ? (
                    <>
                        {" "}
                        <span className="font-medium text-foreground">
                            {toNext} more
                        </span>{" "}
                        to unlock{" "}
                        <span className="font-semibold text-foreground">
                            {nextTier.name}
                        </span>{" "}
                        — {nextTier.reward}
                    </>
                ) : (
                    <> You&apos;ve reached the top tier. Thank you! 🎉</>
                )}
            </p>

            {/* Progress bar toward the next tier */}
            {nextTier ? (
                <div
                    className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted"
                    role="progressbar"
                    aria-valuenow={percentToNext}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`Progress toward ${nextTier.name}`}
                >
                    <div
                        className="h-full rounded-full bg-primary transition-all"
                        style={{
                            width: `${percentToNext}%`,
                        }}
                    />
                </div>
            ) : null}

            {/* Full tier ladder */}
            <ul className="mt-4 space-y-2">
                {tiers.map((t) => (
                    <li
                        key={t.key}
                        className="flex items-start gap-2.5 text-sm"
                    >
                        <span className="mt-0.5 shrink-0">
                            {t.unlocked ? (
                                <Award className="size-4 text-primary" />
                            ) : (
                                <Lock className="size-4 text-muted-foreground" />
                            )}
                        </span>
                        <span className="min-w-0">
                            <span
                                className={
                                    t.unlocked
                                        ? "font-semibold text-foreground"
                                        : "font-medium text-muted-foreground"
                                }
                            >
                                {t.name}
                            </span>
                            <span className="text-muted-foreground">
                                {" "}
                                · {t.threshold} referral
                                {t.threshold === 1 ? "" : "s"} — {t.reward}
                            </span>
                        </span>
                    </li>
                ))}
            </ul>
        </div>
    );
}
