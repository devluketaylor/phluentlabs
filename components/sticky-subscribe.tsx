"use client";

import * as React from "react";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { X } from "lucide-react";
import { z } from "zod";
import { trpc } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const emailSchema = z.string().email();
const DISMISS_KEY = "phl_sticky_subscribe_dismissed";

/**
 * Lightweight sticky/floating subscribe affordance for public issue + archive
 * pages. Appears after the reader scrolls a bit so it never fights the initial
 * reading experience, is dismissible, and remembers the dismissal in
 * localStorage so we don't nag returning readers.
 *
 * Reuses the same subscribe.request mutation + ?ref= attribution as the inline
 * CTA and homepage. Wrapped in Suspense for useSearchParams.
 */
export function StickySubscribe() {
    return (
        <React.Suspense fallback={null}>
            <StickySubscribeInner />
        </React.Suspense>
    );
}

function StickySubscribeInner() {
    const [visible, setVisible] = useState(false);
    const [dismissed, setDismissed] = useState(true); // assume dismissed until we read storage
    const [email, setEmail] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [done, setDone] = useState(false);

    const searchParams = useSearchParams();
    const ref = searchParams.get("ref")?.trim() || undefined;

    const subscribe = trpc.subscribe.request.useMutation();

    // Read the persisted dismissal once on mount.
    useEffect(() => {
        try {
            const wasDismissed = localStorage.getItem(DISMISS_KEY) === "1";
            setDismissed(wasDismissed);
        } catch {
            setDismissed(false);
        }
    }, []);

    // Reveal only after the reader has scrolled past a threshold, so the bar
    // doesn't cover content the moment the page loads.
    useEffect(() => {
        if (dismissed) return;
        const onScroll = () => {
            if (window.scrollY > 600) setVisible(true);
        };
        onScroll();
        window.addEventListener("scroll", onScroll, { passive: true });
        return () => window.removeEventListener("scroll", onScroll);
    }, [dismissed]);

    const dismiss = () => {
        setVisible(false);
        setDismissed(true);
        try {
            localStorage.setItem(DISMISS_KEY, "1");
        } catch {
            /* ignore storage failures */
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        const parsed = emailSchema.safeParse(email.trim());
        if (!parsed.success) {
            setError("Enter a valid email.");
            return;
        }
        try {
            await subscribe.mutateAsync({ email: parsed.data, ref });
            setDone(true);
            // Persist dismissal so a successful subscriber isn't nagged again.
            try {
                localStorage.setItem(DISMISS_KEY, "1");
            } catch {
                /* ignore */
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : "Something went wrong.");
        }
    };

    if (dismissed || !visible) return null;

    return (
        <div className="fixed inset-x-0 bottom-0 z-40 flex justify-center px-3 pb-3 sm:px-4 sm:pb-4">
            <div className="pointer-events-auto w-full max-w-2xl rounded-2xl border bg-card/95 p-3 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-card/80 sm:p-4">
                <button
                    type="button"
                    onClick={dismiss}
                    aria-label="Dismiss"
                    className="absolute right-2 top-2 rounded-full p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                    <X className="h-4 w-4" />
                </button>

                {done ? (
                    <p className="pr-8 text-sm text-muted-foreground">
                        Almost there — check your inbox to confirm your subscription. 🎉
                    </p>
                ) : (
                    <div className="flex flex-col gap-2 pr-6 sm:flex-row sm:items-center sm:gap-4">
                        <div className="min-w-0">
                            <p className="text-sm font-semibold leading-tight">
                                Get PhluentLabs in your inbox
                            </p>
                            <p className="text-xs text-muted-foreground">
                                Notes on building the web, every Sunday.
                            </p>
                        </div>
                        <form
                            onSubmit={handleSubmit}
                            className="flex flex-1 flex-col gap-2 sm:flex-row sm:justify-end"
                        >
                            <Input
                                type="email"
                                placeholder="you@domain.com"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                aria-label="Email address"
                                className="sm:max-w-[16rem]"
                            />
                            <Button
                                type="submit"
                                disabled={subscribe.isPending}
                                style={{ backgroundColor: "#ff5c5c" }}
                                className="text-white hover:opacity-90"
                            >
                                {subscribe.isPending ? "Subscribing…" : "Subscribe"}
                            </Button>
                        </form>
                    </div>
                )}
                {error && !done && (
                    <p className="mt-1.5 pr-8 text-xs text-destructive">{error}</p>
                )}
            </div>
        </div>
    );
}
