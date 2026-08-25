"use client";

import * as React from "react";
import { useState } from "react";
import { z } from "zod";
import { trpc } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const emailSchema = z.string().email();

/**
 * Lightweight subscribe CTA for the bottom of a public issue page.
 * Converts search/social readers into subscribers. Uses the same
 * subscribe.request mutation as the homepage; email-only for low friction.
 */
export function IssueSubscribeCta() {
    const [email, setEmail] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [done, setDone] = useState(false);

    const subscribe = trpc.subscribe.request.useMutation();
    const countQuery = trpc.subscribe.count.useQuery(undefined, {
        staleTime: 5 * 60 * 1000,
    });
    const count = countQuery.data?.count ?? 0;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        const parsed = emailSchema.safeParse(email.trim());
        if (!parsed.success) {
            setError("Enter a valid email address.");
            return;
        }
        try {
            await subscribe.mutateAsync({ email: parsed.data });
            setDone(true);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Something went wrong.");
        }
    };

    return (
        <section className="mt-16 rounded-2xl border bg-card p-6 sm:p-8 text-center">
            {done ? (
                <div className="space-y-2">
                    <h3 className="text-lg font-semibold">Almost there — check your inbox</h3>
                    <p className="text-sm text-muted-foreground">
                        We sent a confirmation link to <span className="font-medium text-foreground">{email}</span>.
                        Click it to finish subscribing.
                    </p>
                </div>
            ) : (
                <>
                    <h3 className="text-lg font-semibold">Enjoyed this issue?</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                        Get the next one in your inbox every Sunday.
                        {count > 0 && (
                            <>
                                {" "}
                                Join{" "}
                                <span className="font-medium text-foreground">
                                    {count >= 50 ? `${Math.floor(count / 10) * 10}+` : count}
                                </span>{" "}
                                developer{count === 1 ? "" : "s"}.
                            </>
                        )}
                    </p>
                    <form onSubmit={handleSubmit} className="mx-auto mt-5 flex max-w-sm flex-col gap-2 sm:flex-row">
                        <Input
                            type="email"
                            placeholder="you@domain.com"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            aria-label="Email address"
                        />
                        <Button type="submit" disabled={subscribe.isPending}>
                            {subscribe.isPending ? "Subscribing…" : "Subscribe"}
                        </Button>
                    </form>
                    {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
                </>
            )}
        </section>
    );
}
