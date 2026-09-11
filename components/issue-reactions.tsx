"use client";

import { useEffect, useState } from "react";
import { ThumbsUp, Minus, ThumbsDown } from "lucide-react";

type Reaction = "up" | "mid" | "down";
type Tally = { up: number; mid: number; down: number; total: number };

const STORAGE_PREFIX = "phl_issue_reaction_";

const OPTIONS: Array<{
    value: Reaction;
    label: string;
    Icon: typeof ThumbsUp;
}> = [
    { value: "up", label: "Useful", Icon: ThumbsUp },
    { value: "mid", label: "So-so", Icon: Minus },
    { value: "down", label: "Not really", Icon: ThumbsDown },
];

/**
 * One-tap anonymous "was this useful?" feedback at the bottom of a public issue.
 * Records a coarse reaction (up / so-so / down) via /api/reactions. No PII —
 * per-reader dedupe is client-side only (localStorage), so a returning reader
 * isn't nudged to vote again on the same issue. Theme-token styled (light+dark
 * safe), coral (#ff5c5c) accent on the chosen option.
 */
export function IssueReactions({ slug }: { slug: string }) {
    const [chosen, setChosen] = useState<Reaction | null>(null);
    const [tally, setTally] = useState<Tally | null>(null);
    const storageKey = STORAGE_PREFIX + slug;

    // On mount, restore any prior vote so we show the "thanks" state instead of
    // re-prompting. Best-effort; localStorage may be unavailable.
    useEffect(() => {
        try {
            const prior = localStorage.getItem(storageKey);
            if (prior === "up" || prior === "mid" || prior === "down") {
                setChosen(prior);
                // Show the running tally to a reader who already voted.
                void loadTally();
            }
        } catch {
            // ignore — storage can be blocked
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [slug]);

    const loadTally = async () => {
        try {
            const res = await fetch(
                `/api/reactions?slug=${encodeURIComponent(slug)}`,
                { cache: "no-store" },
            );
            if (res.ok) {
                const data = (await res.json()) as Tally;
                setTally(data);
            }
        } catch {
            // ignore — tally is a nice-to-have
        }
    };

    const vote = async (reaction: Reaction) => {
        if (chosen) return; // already voted this session/device
        setChosen(reaction);
        try {
            localStorage.setItem(storageKey, reaction);
        } catch {
            // ignore
        }
        try {
            await fetch("/api/reactions", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ slug, reaction }),
                keepalive: true,
            });
        } catch {
            // ignore — feedback must never break the page
        }
        // Refresh the tally so the reader sees their vote reflected.
        void loadTally();
    };

    const btnBase =
        "inline-flex flex-col items-center gap-1 rounded-xl border px-5 py-3 text-sm font-medium transition-colors";

    return (
        <div className="mt-8 rounded-2xl border bg-card p-6">
            {chosen ? (
                <div className="flex flex-col items-center gap-3 text-center">
                    <p className="text-sm font-medium text-foreground">
                        Thanks for the feedback! 🐕
                    </p>
                    {tally && tally.total > 0 ? (
                        <p className="text-xs text-muted-foreground">
                            {tally.up.toLocaleString()} found this useful
                            {tally.total > tally.up
                                ? ` · ${tally.total.toLocaleString()} total ${
                                      tally.total === 1 ? "response" : "responses"
                                  }`
                                : ""}
                        </p>
                    ) : null}
                </div>
            ) : (
                <div className="flex flex-col items-center gap-4 text-center">
                    <p className="text-sm font-medium text-foreground">
                        Was this issue useful?
                    </p>
                    <div className="flex flex-wrap items-center justify-center gap-3">
                        {OPTIONS.map(({ value, label, Icon }) => (
                            <button
                                key={value}
                                type="button"
                                onClick={() => vote(value)}
                                aria-label={label}
                                className={`${btnBase} text-muted-foreground hover:border-[#ff5c5c] hover:text-foreground hover:bg-muted`}
                            >
                                <Icon className="size-5" />
                                <span>{label}</span>
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
