"use client";

import * as React from "react";
import { toast } from "sonner";
import { Check, Copy, Gift, Users } from "lucide-react";

import { trpc } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * ReferralShare — the subscriber-facing "your referral link" surface.
 *
 * Given the signed confirm `token` (which proves the caller owns their own
 * subscriber row), this fetches the caller's OWN referral code + referral
 * count and shows: their personal share link, a copy-link button with copied
 * feedback, and how many developers they've referred so far.
 *
 * Coral accent (#ff5c5c → the `primary` token) is used for the accent; every
 * other color is a theme token so it stays clean in light + dark mode.
 */
export function ReferralShare({ token }: { token: string }) {
    const referral = trpc.subscribe.myReferral.useQuery(
        { token },
        { enabled: !!token, staleTime: 60 * 1000 },
    );
    const [copied, setCopied] = React.useState(false);

    // Build the absolute share link from the current origin so it works in any
    // environment (localhost in dev, the real domain in prod).
    const shareUrl = React.useMemo(() => {
        const code = referral.data?.referralCode;
        if (!code) return "";
        const origin =
            typeof window !== "undefined" ? window.location.origin : "";
        return `${origin}/?ref=${code}`;
    }, [referral.data?.referralCode]);

    const onCopy = React.useCallback(async () => {
        if (!shareUrl) return;
        try {
            await navigator.clipboard.writeText(shareUrl);
            setCopied(true);
            toast.success("Referral link copied!");
            window.setTimeout(() => setCopied(false), 2000);
        } catch {
            toast.error("Couldn't copy — copy the link manually.");
        }
    }, [shareUrl]);

    // Don't render anything if we can't establish a code (e.g. no/expired
    // token). The confirm success message stands on its own in that case.
    if (referral.isError) return null;

    const count = referral.data?.referralCount ?? 0;

    return (
        <div className="mt-8 w-full max-w-md mx-auto rounded-2xl border bg-card p-5 sm:p-6 shadow-sm text-left">
            <div className="flex items-center gap-2 mb-1">
                <Gift className="size-4 text-primary" />
                <h3 className="font-semibold">Share &amp; grow the list</h3>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
                Invite other developers with your personal link. We&apos;ll credit
                every signup to you.
            </p>

            {referral.isLoading ? (
                <Skeleton className="h-10 w-full rounded-md" />
            ) : (
                <div className="flex gap-2">
                    <Input
                        readOnly
                        value={shareUrl}
                        onFocus={(e) => e.currentTarget.select()}
                        className="font-mono text-sm"
                        aria-label="Your referral link"
                    />
                    <Button
                        type="button"
                        onClick={onCopy}
                        className="shrink-0 gap-1.5"
                        disabled={!shareUrl}
                    >
                        {copied ? (
                            <Check className="size-4" />
                        ) : (
                            <Copy className="size-4" />
                        )}
                        {copied ? "Copied" : "Copy"}
                    </Button>
                </div>
            )}

            <div className="mt-4 flex items-center gap-2 text-sm">
                <Users className="size-4 text-muted-foreground" />
                {referral.isLoading ? (
                    <Skeleton className="h-4 w-40" />
                ) : (
                    <span className="text-muted-foreground">
                        You&apos;ve referred{" "}
                        <span className="font-semibold text-foreground">
                            {count}
                        </span>{" "}
                        developer{count === 1 ? "" : "s"}.
                    </span>
                )}
            </div>
        </div>
    );
}
