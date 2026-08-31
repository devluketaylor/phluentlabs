"use client";

import * as React from "react";
import { z } from "zod";
import { useSearchParams } from "next/navigation";
import { trpc } from "@/trpc/client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const emailSchema = z.string().email();

/**
 * Lightweight, self-contained subscribe form intended to be embedded on
 * external sites via an <iframe> (see /embed/subscribe). It deliberately keeps
 * the surface small: a single email field (optional first name) + one button,
 * inline validation, and a success/error message. It reuses the same public
 * `subscribe.request` tRPC mutation the homepage uses and honours a ?ref=
 * referral code so shared embeds still credit the referrer.
 *
 * Query params it understands (all optional):
 *   ?ref=<code>       referral attribution
 *   ?name=1           also collect a first name
 *   ?title=...        heading text (default "Subscribe for free")
 *   ?subtitle=...     supporting line under the heading
 */
export function SubscribeWidget() {
    const searchParams = useSearchParams();
    const ref = searchParams.get("ref")?.trim() || undefined;
    const collectName = searchParams.get("name") === "1";
    const title = searchParams.get("title")?.trim() || "Subscribe for free";
    const subtitle = searchParams.get("subtitle")?.trim() || undefined;

    const [email, setEmail] = React.useState("");
    const [firstName, setFirstName] = React.useState("");
    const [error, setError] = React.useState<string | null>(null);
    const [done, setDone] = React.useState(false);

    const subscribeRequest = trpc.subscribe.request.useMutation();

    const onSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        const parsed = emailSchema.safeParse(email.trim());
        if (!parsed.success) {
            setError("Enter a valid email address.");
            return;
        }
        try {
            await subscribeRequest.mutateAsync({
                email: parsed.data,
                firstName: collectName && firstName.trim() ? firstName.trim() : undefined,
                ref,
            });
            setDone(true);
        } catch {
            setError("Something went wrong. Please try again.");
        }
    };

    if (done) {
        return (
            <div className="rounded-2xl border bg-card p-5 text-center shadow-sm">
                <p className="font-semibold">You're almost in! 🎉</p>
                <p className="text-muted-foreground mt-1 text-sm">
                    Check your inbox to confirm your subscription.
                </p>
            </div>
        );
    }

    return (
        <div className="rounded-2xl border bg-card p-5 shadow-sm">
            <h2 className="font-semibold">
                <span className="bg-linear-to-tr from-primary to-red-500 bg-clip-text text-transparent">
                    Phluent
                </span>
                <span className="text-muted-foreground">Labs</span>
                {" — "}
                {title}
            </h2>
            {subtitle && (
                <p className="text-muted-foreground mt-1 text-sm">{subtitle}</p>
            )}
            <form onSubmit={onSubmit} className="mt-4 space-y-3">
                {collectName && (
                    <Input
                        type="text"
                        placeholder="First name"
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        aria-label="First name"
                    />
                )}
                <Input
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    placeholder="you@domain.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    aria-label="Email address"
                />
                {error && (
                    <p className="text-destructive text-sm" role="alert">
                        {error}
                    </p>
                )}
                <Button
                    type="submit"
                    className="w-full"
                    disabled={subscribeRequest.isPending}
                >
                    {subscribeRequest.isPending ? "Subscribing..." : "Subscribe"}
                </Button>
            </form>
            <p className="text-muted-foreground mt-3 text-center text-xs">
                No spam. Unsubscribe anytime.
            </p>
        </div>
    );
}
