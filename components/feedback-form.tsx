"use client";

import * as React from "react";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { z } from "zod";
import { trpc } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Check, MessageSquare } from "lucide-react";

const emailSchema = z.string().email();

/**
 * Public, no-auth reader feedback form. Reads ?issue=<slug> to attribute the
 * note to the issue the reader came from (server re-validates the slug against
 * PUBLISHED issues; unknown slugs are still accepted as general feedback).
 * Email is optional — a reader can choose to leave one so we can reply.
 *
 * Wrapped in Suspense because useSearchParams opts the subtree into CSR.
 */
export function FeedbackForm() {
    return (
        <Suspense fallback={null}>
            <FeedbackFormInner />
        </Suspense>
    );
}

function FeedbackFormInner() {
    const params = useSearchParams();
    const slug = params.get("issue")?.trim() || undefined;

    const [message, setMessage] = useState("");
    const [email, setEmail] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [done, setDone] = useState(false);

    const submit = trpc.newsletter.submitFeedback.useMutation();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        const trimmed = message.trim();
        if (!trimmed) {
            setError("Please write a message first.");
            return;
        }
        if (trimmed.length > 5000) {
            setError("That's a bit long — please keep it under 5000 characters.");
            return;
        }
        const emailTrimmed = email.trim();
        if (emailTrimmed && !emailSchema.safeParse(emailTrimmed).success) {
            setError("That email doesn't look right. Leave it blank to send anonymously.");
            return;
        }

        try {
            await submit.mutateAsync({
                message: trimmed,
                email: emailTrimmed || undefined,
                slug,
            });
            setDone(true);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
        }
    };

    if (done) {
        return (
            <Card className="mt-8 p-6 text-center sm:p-8">
                <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-[#ff5c5c]/10">
                    <Check className="h-5 w-5 text-[#ff5c5c]" />
                </div>
                <h2 className="text-lg font-semibold">Thanks — got it</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                    We read every note. Appreciate you taking the time.
                </p>
            </Card>
        );
    }

    return (
        <Card className="mt-8 p-6 sm:p-8">
            <form onSubmit={handleSubmit} className="space-y-5">
                <div className="space-y-2">
                    <Label htmlFor="feedback-message" className="flex items-center gap-1.5">
                        <MessageSquare className="h-4 w-4 text-muted-foreground" />
                        Your message
                    </Label>
                    <textarea
                        id="feedback-message"
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        rows={6}
                        maxLength={5000}
                        placeholder="What's on your mind?"
                        className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-y"
                    />
                </div>

                <div className="space-y-2">
                    <Label htmlFor="feedback-email">
                        Email <span className="text-muted-foreground">(optional — so we can reply)</span>
                    </Label>
                    <Input
                        id="feedback-email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="you@domain.com"
                        autoComplete="email"
                    />
                </div>

                {error && <p className="text-sm text-destructive">{error}</p>}

                <Button type="submit" disabled={submit.isPending} className="w-full sm:w-auto">
                    {submit.isPending ? "Sending…" : "Send feedback"}
                </Button>
            </form>
        </Card>
    );
}
