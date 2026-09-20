"use client";

import * as React from "react";
import { useState } from "react";
import { z } from "zod";
import { trpc } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const emailSchema = z.string().email();

/**
 * Compact inline subscribe form for the site footer.
 * Reuses the same subscribe.request mutation + double opt-in flow as the
 * homepage; email-only for low friction. Referral attribution is intentionally
 * omitted here (the footer is global chrome, not a share-driven surface).
 */
export function FooterSubscribe() {
    const [email, setEmail] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [done, setDone] = useState(false);

    const subscribe = trpc.subscribe.request.useMutation();

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

    if (done) {
        return (
            <p className="text-sm text-muted-foreground">
                Check your inbox — we sent a confirmation link to{" "}
                <span className="font-medium text-foreground">{email}</span>.
            </p>
        );
    }

    return (
        <form onSubmit={handleSubmit} className="flex flex-col gap-2 sm:flex-row">
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
            {error && (
                <p className="text-sm text-destructive sm:hidden">{error}</p>
            )}
        </form>
    );
}
