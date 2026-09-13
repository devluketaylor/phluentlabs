"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { trpc } from "@/trpc/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Check, Gift, Pause, Play, UserX } from "lucide-react";
import { ReferralMilestones } from "@/components/referral-milestones";

function PreferencesContent() {
    const params = useSearchParams();
    const token = params.get("token") ?? "";

    const utils = trpc.useUtils();
    const prefs = trpc.subscribe.getPreferences.useQuery(
        { token },
        { enabled: !!token, retry: false },
    );

    const update = trpc.subscribe.updatePreferences.useMutation();

    // Referral standing + reward-tier progress (prefs-token variant).
    const referral = trpc.subscribe.myReferralByPrefs.useQuery(
        { token },
        { enabled: !!token, retry: false, staleTime: 60 * 1000 },
    );

    const [firstName, setFirstName] = useState("");
    const [lastName, setLastName] = useState("");

    // Seed the local form from the loaded preferences (once available).
    useEffect(() => {
        if (prefs.data) {
            setFirstName(prefs.data.firstName ?? "");
            setLastName(prefs.data.lastName ?? "");
        }
    }, [prefs.data]);

    if (!token) {
        return (
            <Card className="w-full max-w-md p-6">
                <h1 className="text-xl font-semibold">Manage preferences</h1>
                <p className="mt-2 text-sm text-muted-foreground">
                    This link is missing a token. Please use the preferences link
                    from one of our emails.
                </p>
            </Card>
        );
    }

    if (prefs.isLoading) {
        return (
            <Card className="w-full max-w-md p-6 space-y-4">
                <Skeleton className="h-6 w-40" />
                <Skeleton className="h-4 w-64" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-32" />
            </Card>
        );
    }

    if (prefs.isError || !prefs.data) {
        return (
            <Card className="w-full max-w-md p-6">
                <h1 className="text-xl font-semibold">Link expired</h1>
                <p className="mt-2 text-sm text-muted-foreground">
                    This preferences link is invalid or has expired. Look for a more
                    recent email from us, or subscribe again.
                </p>
            </Card>
        );
    }

    const status = prefs.data.status;
    const isSubscribed = status === "subscribed";
    const isPaused = status === "paused";
    const isUnsubscribed = status === "unsubscribed";

    const saveName = async () => {
        try {
            await update.mutateAsync({ token, firstName, lastName });
            await utils.subscribe.getPreferences.invalidate({ token });
            toast.success("Your details were saved.");
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "Something went wrong.");
        }
    };

    const changeStatus = async (
        next: "subscribed" | "paused" | "unsubscribed",
        successMsg: string,
    ) => {
        try {
            await update.mutateAsync({ token, status: next });
            await utils.subscribe.getPreferences.invalidate({ token });
            toast.success(successMsg);
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "Something went wrong.");
        }
    };

    const statusLabel = isSubscribed
        ? "Subscribed"
        : isPaused
            ? "Paused"
            : isUnsubscribed
                ? "Unsubscribed"
                : status;

    return (
        <Card className="w-full max-w-md p-6">
            <h1 className="text-xl font-semibold">Manage preferences</h1>
            <p className="mt-1 text-sm text-muted-foreground">{prefs.data.email}</p>

            <div className="mt-2 flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">Status:</span>
                <span className="inline-flex items-center rounded-full border border-border bg-muted px-2.5 py-0.5 text-xs font-medium text-foreground">
                    {statusLabel}
                </span>
            </div>

            {/* Referral standing + reward milestones */}
            {referral.data?.progress && status !== "unsubscribed" ? (
                <div className="mt-6 rounded-xl border bg-card p-4">
                    <div className="flex items-center gap-2">
                        <Gift className="size-4 text-primary" />
                        <p className="text-sm font-medium">Your referrals</p>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                        You&apos;ve referred{" "}
                        <span className="font-semibold text-foreground">
                            {referral.data.referralCount}
                        </span>{" "}
                        developer{referral.data.referralCount === 1 ? "" : "s"}.
                    </p>
                    <ReferralMilestones progress={referral.data.progress} />
                </div>
            ) : null}

            {/* Name editor */}
            <div className="mt-6 space-y-4">
                <div className="space-y-2">
                    <Label htmlFor="firstName">First name</Label>
                    <Input
                        id="firstName"
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        placeholder="Your first name"
                    />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="lastName">Last name</Label>
                    <Input
                        id="lastName"
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                        placeholder="Your last name"
                    />
                </div>
                <Button onClick={saveName} disabled={update.isPending}>
                    {update.isPending ? "Saving..." : "Save details"}
                </Button>
            </div>

            {/* Delivery controls */}
            <div className="mt-8 border-t pt-6 space-y-3">
                <p className="text-sm font-medium">Email delivery</p>

                {isSubscribed ? (
                    <>
                        <p className="text-sm text-muted-foreground">
                            Need a break? Pause to temporarily stop emails without
                            unsubscribing — resume anytime.
                        </p>
                        <div className="flex flex-wrap gap-3">
                            <Button
                                variant="outline"
                                onClick={() => changeStatus("paused", "Emails paused. Resume anytime.")}
                                disabled={update.isPending}
                            >
                                <Pause className="size-4" /> Pause emails
                            </Button>
                            <Button
                                variant="ghost"
                                onClick={() => changeStatus("unsubscribed", "You've been unsubscribed.")}
                                disabled={update.isPending}
                                className="text-muted-foreground"
                            >
                                <UserX className="size-4" /> Unsubscribe
                            </Button>
                        </div>
                    </>
                ) : null}

                {isPaused ? (
                    <>
                        <p className="text-sm text-muted-foreground">
                            Your emails are paused. Resume to start receiving the
                            newsletter again.
                        </p>
                        <div className="flex flex-wrap gap-3">
                            <Button
                                onClick={() => changeStatus("subscribed", "Welcome back — emails resumed.")}
                                disabled={update.isPending}
                            >
                                <Play className="size-4" /> Resume emails
                            </Button>
                            <Button
                                variant="ghost"
                                onClick={() => changeStatus("unsubscribed", "You've been unsubscribed.")}
                                disabled={update.isPending}
                                className="text-muted-foreground"
                            >
                                <UserX className="size-4" /> Unsubscribe
                            </Button>
                        </div>
                    </>
                ) : null}

                {isUnsubscribed ? (
                    <>
                        <p className="text-sm text-muted-foreground">
                            You're unsubscribed and won't receive the newsletter.
                            Changed your mind? Resubscribe below.
                        </p>
                        <Button
                            onClick={() => changeStatus("subscribed", "You're resubscribed. Welcome back!")}
                            disabled={update.isPending}
                        >
                            <Check className="size-4" /> Resubscribe
                        </Button>
                    </>
                ) : null}

                {!isSubscribed && !isPaused && !isUnsubscribed ? (
                    <p className="text-sm text-muted-foreground">
                        Your subscription is still pending confirmation. Check your
                        inbox for the confirmation email.
                    </p>
                ) : null}
            </div>
        </Card>
    );
}

export default function PreferencesPage() {
    return (
        <main className="min-h-[calc(100vh-1px)] flex items-center justify-center p-6">
            <Suspense
                fallback={
                    <p className="text-sm text-muted-foreground">Loading...</p>
                }
            >
                <PreferencesContent />
            </Suspense>
        </main>
    );
}
