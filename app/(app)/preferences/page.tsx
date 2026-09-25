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
import { AtSign, Check, Clock, Download, Gift, Layers, Pause, Play, UserX } from "lucide-react";
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

    // Per-publication opt-ins (prefs-token variant). Only surfaces when more
    // than one publication exists (i.e. there's a real choice to make).
    const pubOptIns = trpc.subscribe.getPublicationOptIns.useQuery(
        { token },
        { enabled: !!token, retry: false, staleTime: 60 * 1000 },
    );
    const togglePub = trpc.subscribe.updatePublicationOptIn.useMutation();

    const setPublicationOptIn = async (publicationId: string, optIn: boolean) => {
        try {
            await togglePub.mutateAsync({ token, publicationId, optIn });
            await utils.subscribe.getPublicationOptIns.invalidate({ token });
            toast.success(optIn ? "Subscribed to that stream." : "Unsubscribed from that stream.");
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "Something went wrong.");
        }
    };

    const [firstName, setFirstName] = useState("");
    const [lastName, setLastName] = useState("");
    const [newEmail, setNewEmail] = useState("");
    const [exporting, setExporting] = useState(false);

    const updateEmail = trpc.subscribe.updateEmail.useMutation();

    // GDPR/CCPA "my data" export — fetches the caller's own record on demand
    // and saves it as a JSON file client-side.
    const downloadMyData = async () => {
        setExporting(true);
        try {
            const data = await utils.subscribe.exportMyData.fetch({ token });
            const blob = new Blob([JSON.stringify(data, null, 2)], {
                type: "application/json",
            });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            const stamp = new Date().toISOString().slice(0, 10);
            a.download = `phluent-my-data-${stamp}.json`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
            toast.success("Your data has been downloaded.");
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "Something went wrong.");
        } finally {
            setExporting(false);
        }
    };

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

    const saveEmail = async () => {
        const trimmed = newEmail.trim();
        if (!trimmed) return;
        try {
            const res = await updateEmail.mutateAsync({ token, email: trimmed });
            if (res.unchanged) {
                toast.info("That's already your current email.");
                return;
            }
            if (res.taken) {
                // Generic message — don't confirm the address is on the list.
                toast.error("We couldn't switch to that address. Please try a different one.");
                return;
            }
            setNewEmail("");
            await utils.subscribe.getPreferences.invalidate({ token });
            toast.success(
                res.sent
                    ? "Email updated — check your new inbox to confirm the change."
                    : "Email updated — please confirm the change from the email we just sent.",
            );
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

    const snooze = async (weeks: 2 | 4 | 8 | null, successMsg: string) => {
        try {
            await update.mutateAsync({ token, snoozeWeeks: weeks });
            await utils.subscribe.getPreferences.invalidate({ token });
            toast.success(successMsg);
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "Something went wrong.");
        }
    };

    // Active time-boxed snooze (future pausedUntil while still subscribed).
    const snoozedUntil = prefs.data.snoozedUntil
        ? new Date(prefs.data.snoozedUntil)
        : null;
    const snoozedUntilLabel = snoozedUntil
        ? snoozedUntil.toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
              year: "numeric",
          })
        : null;

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

            {/* Per-publication opt-ins — a clear one-place summary of every stream
                the subscriber is (or isn't) receiving, with toggle affordances.
                Shown whenever at least one publication exists so the always-on
                primary stream is always visible as a "you're subscribed to"
                summary — not only when a second stream exists. */}
            {pubOptIns.data && pubOptIns.data.publications.length >= 1 && status !== "unsubscribed" ? (() => {
                const pubs = pubOptIns.data.publications;
                const receivingCount = pubs.filter((p) => p.isPrimary || p.optedIn).length;
                const hasChoice = pubs.some((p) => !p.isPrimary);
                return (
                <div className="mt-6 rounded-xl border bg-card p-4">
                    <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                            <Layers className="size-4 text-primary" />
                            <p className="text-sm font-medium">Your subscriptions</p>
                        </div>
                        <span className="shrink-0 inline-flex items-center rounded-full border border-border bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                            Receiving {receivingCount} of {pubs.length}
                        </span>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                        {hasChoice
                            ? "Here's every stream we publish — choose which you want to receive."
                            : "Here's what you're currently receiving."}
                    </p>
                    <div className="mt-3 space-y-2">
                        {pubOptIns.data.publications.map((p) => (
                            <div
                                key={p.id}
                                className="flex items-start justify-between gap-3 border-b border-border pb-2 last:border-b-0 last:pb-0"
                            >
                                <div className="min-w-0">
                                    <p className="text-sm font-medium text-foreground">{p.name}</p>
                                    {p.description ? (
                                        <p className="text-xs text-muted-foreground">{p.description}</p>
                                    ) : null}
                                </div>
                                {p.isPrimary ? (
                                    <span className="shrink-0 inline-flex items-center rounded-full border border-border bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                                        Always on
                                    </span>
                                ) : p.optedIn ? (
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="shrink-0"
                                        onClick={() => setPublicationOptIn(p.id, false)}
                                        disabled={togglePub.isPending}
                                    >
                                        <Check className="size-4" /> Subscribed
                                    </Button>
                                ) : (
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="shrink-0 text-muted-foreground"
                                        onClick={() => setPublicationOptIn(p.id, true)}
                                        disabled={togglePub.isPending}
                                    >
                                        Subscribe
                                    </Button>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
                );
            })() : null}

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

            {/* Email-address editor — changing the address re-confirms via
                double opt-in (a fresh confirm email is sent to the new inbox). */}
            <div className="mt-8 border-t pt-6 space-y-3">
                <div className="flex items-center gap-2">
                    <AtSign className="size-4 text-primary" />
                    <p className="text-sm font-medium">Delivery email</p>
                </div>
                <p className="text-sm text-muted-foreground">
                    Want your newsletter sent somewhere else? Enter a new address
                    below. For your security we&apos;ll send a confirmation link to
                    the new inbox — issues keep going to your current address until
                    you confirm the change.
                </p>
                <div className="space-y-2">
                    <Label htmlFor="newEmail">New email address</Label>
                    <Input
                        id="newEmail"
                        type="email"
                        value={newEmail}
                        onChange={(e) => setNewEmail(e.target.value)}
                        placeholder="you@example.com"
                    />
                </div>
                <Button
                    variant="outline"
                    onClick={saveEmail}
                    disabled={updateEmail.isPending || !newEmail.trim()}
                >
                    {updateEmail.isPending ? "Updating..." : "Update email"}
                </Button>
            </div>

            {/* Your data (GDPR/CCPA export) */}
            <div className="mt-8 border-t pt-6 space-y-3">
                <div className="flex items-center gap-2">
                    <Download className="size-4 text-primary" />
                    <p className="text-sm font-medium">Your data</p>
                </div>
                <p className="text-sm text-muted-foreground">
                    Download a copy of the data we hold about you — your record,
                    subscriptions, and engagement summary — as a JSON file.
                </p>
                <Button
                    variant="outline"
                    onClick={downloadMyData}
                    disabled={exporting}
                >
                    <Download className="size-4" />{" "}
                    {exporting ? "Preparing..." : "Download my data"}
                </Button>
            </div>

            {/* Delivery controls */}
            <div className="mt-8 border-t pt-6 space-y-3">
                <p className="text-sm font-medium">Email delivery</p>

                {isSubscribed && snoozedUntilLabel ? (
                    <>
                        <div className="rounded-lg border border-border bg-muted/40 p-3">
                            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                                <Clock className="size-4" /> Snoozed until {snoozedUntilLabel}
                            </div>
                            <p className="mt-1 text-sm text-muted-foreground">
                                You&apos;re still subscribed — emails pause until then,
                                and we&apos;ll automatically resume you. Resume early
                                anytime.
                            </p>
                        </div>
                        <div className="flex flex-wrap gap-3">
                            <Button
                                onClick={() => snooze(null, "Welcome back — emails resumed.")}
                                disabled={update.isPending}
                            >
                                <Play className="size-4" /> Resume now
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
                ) : isSubscribed ? (
                    <>
                        <p className="text-sm text-muted-foreground">
                            Need a break? Snooze for a set time (we&apos;ll auto-resume
                            you), or pause indefinitely — either way you stay subscribed.
                        </p>
                        <div className="flex flex-wrap gap-2">
                            {[2, 4, 8].map((w) => (
                                <Button
                                    key={w}
                                    variant="outline"
                                    size="sm"
                                    onClick={() =>
                                        snooze(
                                            w as 2 | 4 | 8,
                                            `Snoozed for ${w} weeks — we'll bring you back automatically.`,
                                        )
                                    }
                                    disabled={update.isPending}
                                >
                                    <Clock className="size-4" /> Pause {w} weeks
                                </Button>
                            ))}
                        </div>
                        <div className="flex flex-wrap gap-3">
                            <Button
                                variant="outline"
                                onClick={() => changeStatus("paused", "Emails paused. Resume anytime.")}
                                disabled={update.isPending}
                            >
                                <Pause className="size-4" /> Pause indefinitely
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
