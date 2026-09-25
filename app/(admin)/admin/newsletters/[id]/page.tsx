"use client";

import { FormHeader } from "@/components/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { trpc } from "@/trpc/client";
import {
    BarChart3,
    ArrowLeft,
    Send,
    MailOpen,
    MousePointerClick,
    AlertTriangle,
    ShieldAlert,
    Users,
    ExternalLink,
    FlaskConical,
    Trophy,
    Eye,
    Globe,
    Share2,
    ThumbsUp,
    MessagesSquare,
    MailX,
    History,
} from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";

function formatDateTime(d: Date | string | null | undefined) {
    if (!d) return "—";
    const date = typeof d === "string" ? new Date(d) : d;
    return date.toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
    });
}

function StatCard({
    label,
    value,
    sub,
    icon,
}: {
    label: string;
    value: React.ReactNode;
    sub?: React.ReactNode;
    icon: React.ReactNode;
}) {
    return (
        <Card>
            <CardContent className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">{label}</p>
                    <p className="text-2xl font-semibold">{value}</p>
                    {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
                </div>
                <div className="text-primary shrink-0">{icon}</div>
            </CardContent>
        </Card>
    );
}

export default function NewsletterAnalyticsPage() {
    const params = useParams<{ id: string }>();
    const id = params.id;
    const router = useRouter();

    const { data, isLoading, isError, error, refetch, isFetching } =
        trpc.adminNewsletter.analytics.useQuery(
            { id },
            { refetchOnWindowFocus: false, retry: false }
        );

    // Resend history: has this issue already been resent to its non-openers,
    // and how many did that reach? (Tier 17 #3 — avoid an accidental double
    // resend.) Only meaningful for sent issues, so gate the fetch on that.
    const { data: resendData } = trpc.adminNewsletter.resendHistory.useQuery(
        { id },
        {
            enabled: data?.newsletter?.status === "sent",
            refetchOnWindowFocus: false,
            retry: false,
        }
    );

    // One-click "resend to non-openers": duplicate THIS sent issue into a fresh
    // draft (giving the editor a chance to tweak the subject), then hand off to
    // the newsletters table which auto-opens the new draft's Send dialog with
    // the "non-openers of this issue" audience pre-selected.
    const duplicate = trpc.adminNewsletter.duplicate.useMutation({
        onSuccess: (res) => {
            const draftId = (res as { id?: string } | undefined)?.id;
            if (!draftId) {
                toast.error("Could not create the resend draft.");
                return;
            }
            toast.success("Draft created \u2014 resending to non-openers");
            router.push(
                `/admin/newsletters?draft=${encodeURIComponent(draftId)}&resend=${encodeURIComponent(id)}`,
            );
        },
        onError: (err) => toast.error(err.message || "Failed to start resend"),
    });

    const n = data?.newsletter;
    const c = data?.counts;
    const r = data?.rates;
    const ab = data?.abTest;
    const web = data?.web;
    const shares = data?.shares;
    const reactions = data?.reactions;
    const feedback = data?.feedback;

    // Delivered-but-never-opened count for the resend button label. Guards
    // against negative rounding by flooring at 0.
    const nonOpenerCount = c ? Math.max(0, c.delivered - c.opened) : null;

    const platformLabels: Record<string, string> = {
        x: "X / Twitter",
        linkedin: "LinkedIn",
        copy: "Copy link",
        other: "Other",
    };

    const bucketLabels: Record<string, string> = {
        search: "Search",
        social: "Social",
        direct: "Direct",
        internal: "Internal",
        other: "Other",
    };

    return (
        <div className="max-w-4xl mx-auto pt-8 pb-16 px-4 space-y-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <FormHeader
                    icon={<BarChart3 />}
                    title="Issue analytics"
                    description="Delivery + engagement for a single newsletter."
                />
                <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
                    <Button variant="secondary" asChild>
                        <Link href="/admin/newsletters">
                            <ArrowLeft className="size-4" />
                            Back
                        </Link>
                    </Button>
                    {n?.status === "sent" && (
                        <Button
                            variant={resendData && resendData.count > 0 ? "secondary" : "default"}
                            onClick={() => duplicate.mutate({ id })}
                            disabled={duplicate.isPending}
                            title={
                                resendData && resendData.count > 0
                                    ? `Already resent to non-openers ${resendData.count} ${resendData.count === 1 ? "time" : "times"} (reached ${resendData.totalReached.toLocaleString()}). Resend again only if you're sure.`
                                    : "Duplicate this issue into a fresh draft and resend it only to the subscribers who never opened it"
                            }
                        >
                            <MailX className="size-4" />
                            {duplicate.isPending
                                ? "Preparing…"
                                : resendData && resendData.count > 0
                                  ? "Resend again"
                                  : nonOpenerCount !== null
                                    ? `Resend to non-openers (${nonOpenerCount.toLocaleString()})`
                                    : "Resend to non-openers"}
                        </Button>
                    )}
                    <Button
                        variant="secondary"
                        onClick={() => refetch()}
                        disabled={isFetching}
                    >
                        {isFetching ? "Refreshing…" : "Refresh"}
                    </Button>
                </div>
            </div>

            {isError && (
                <Card>
                    <CardContent className="text-sm text-destructive">
                        {error?.message ?? "Failed to load analytics."}
                    </CardContent>
                </Card>
            )}

            {/* Issue header */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                        <Send className="size-4 text-primary" />
                        {isLoading || !n ? (
                            <Skeleton className="h-5 w-64" />
                        ) : (
                            <span className="truncate">{n.subject}</span>
                        )}
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-1 text-sm text-muted-foreground">
                    {isLoading || !n ? (
                        <Skeleton className="h-4 w-40" />
                    ) : (
                        <>
                            <p>
                                {n.status === "sent"
                                    ? `Sent ${formatDateTime(n.sentAt)}`
                                    : `Status: ${n.status}`}
                            </p>
                            {n.slug && (
                                <Link
                                    href={`/issues/${n.slug}`}
                                    className="inline-flex items-center gap-1 hover:text-[#ff5c5c]"
                                >
                                    View public issue <ExternalLink className="size-3" />
                                </Link>
                            )}
                        </>
                    )}
                </CardContent>
            </Card>

            {/* Headline rate cards */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {isLoading || !r || !c ? (
                    Array.from({ length: 4 }).map((_, i) => (
                        <Card key={i}>
                            <CardContent>
                                <Skeleton className="h-4 w-20" />
                                <Skeleton className="mt-2 h-7 w-16" />
                            </CardContent>
                        </Card>
                    ))
                ) : (
                    <>
                        <StatCard
                            label="Delivered"
                            value={c.delivered.toLocaleString()}
                            sub={`${r.deliveryRate}% of ${c.recipients.toLocaleString()} sent`}
                            icon={<Users className="size-6" />}
                        />
                        <StatCard
                            label="Open rate"
                            value={`${r.openRate}%`}
                            sub={`${c.opened.toLocaleString()} opened`}
                            icon={<MailOpen className="size-6" />}
                        />
                        <StatCard
                            label="Click rate"
                            value={`${r.clickRate}%`}
                            sub={`${c.clicked.toLocaleString()} clicked`}
                            icon={<MousePointerClick className="size-6" />}
                        />
                        <StatCard
                            label="Bounce rate"
                            value={`${r.bounceRate}%`}
                            sub={`${c.bounced.toLocaleString()} bounced`}
                            icon={<AlertTriangle className="size-6" />}
                        />
                    </>
                )}
            </div>

            {/* Public web analytics — reads of the /issues page on the website,
                distinct from the email open/click metrics above. */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                        <Globe className="size-4 text-primary" />
                        Web views
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {isLoading || !web ? (
                        <div className="space-y-2">
                            <Skeleton className="h-8 w-24" />
                            <Skeleton className="h-4 w-full" />
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <div className="flex items-center gap-2">
                                <Eye className="size-6 text-primary" />
                                <span className="text-2xl font-semibold">
                                    {web.views.toLocaleString()}
                                </span>
                                <span className="text-sm text-muted-foreground">
                                    page {web.views === 1 ? "view" : "views"} on the archive
                                </span>
                            </div>
                            {web.referrers.length > 0 ? (
                                <div>
                                    <p className="text-xs text-muted-foreground mb-2">Traffic source</p>
                                    <ul className="divide-y text-sm">
                                        {web.referrers.map((rf) => (
                                            <li
                                                key={rf.bucket}
                                                className="flex items-center justify-between py-2"
                                            >
                                                <span>{bucketLabels[rf.bucket] ?? rf.bucket}</span>
                                                <span className="font-medium">
                                                    {rf.views.toLocaleString()}
                                                </span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            ) : (
                                <p className="text-sm text-muted-foreground">
                                    No web views recorded yet.
                                </p>
                            )}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Public share-clicks — taps on the issue's X / LinkedIn / copy-link
                share row, distinct from email + web-view metrics above. */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                        <Share2 className="size-4 text-primary" />
                        Shares
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {isLoading || !shares ? (
                        <div className="space-y-2">
                            <Skeleton className="h-8 w-24" />
                            <Skeleton className="h-4 w-full" />
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <div className="flex items-center gap-2">
                                <Share2 className="size-6 text-primary" />
                                <span className="text-2xl font-semibold">
                                    {shares.total.toLocaleString()}
                                </span>
                                <span className="text-sm text-muted-foreground">
                                    share {shares.total === 1 ? "click" : "clicks"} from the archive
                                </span>
                            </div>
                            {shares.channels.length > 0 ? (
                                <div>
                                    <p className="text-xs text-muted-foreground mb-2">Channel</p>
                                    <ul className="divide-y text-sm">
                                        {shares.channels.map((ch) => (
                                            <li
                                                key={ch.platform}
                                                className="flex items-center justify-between py-2"
                                            >
                                                <span>{platformLabels[ch.platform] ?? ch.platform}</span>
                                                <span className="font-medium">
                                                    {ch.shares.toLocaleString()}
                                                </span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            ) : (
                                <p className="text-sm text-muted-foreground">
                                    No shares recorded yet.
                                </p>
                            )}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Reader reactions — anonymous one-tap "was this useful?" feedback
                on the public issue page. Coarse up / so-so / down tally. */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                        <ThumbsUp className="size-4 text-primary" />
                        Reader feedback
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {isLoading || !reactions ? (
                        <div className="space-y-2">
                            <Skeleton className="h-8 w-24" />
                            <Skeleton className="h-4 w-full" />
                        </div>
                    ) : reactions.total > 0 ? (
                        <div className="space-y-4">
                            <div className="flex items-center gap-2">
                                <ThumbsUp className="size-6 text-primary" />
                                <span className="text-2xl font-semibold">
                                    {reactions.usefulRate}%
                                </span>
                                <span className="text-sm text-muted-foreground">
                                    found this useful ({reactions.total.toLocaleString()}{" "}
                                    {reactions.total === 1 ? "response" : "responses"})
                                </span>
                            </div>
                            <ul className="divide-y text-sm">
                                <li className="flex items-center justify-between py-2">
                                    <span>Useful</span>
                                    <span className="font-medium">
                                        {reactions.up.toLocaleString()}
                                    </span>
                                </li>
                                <li className="flex items-center justify-between py-2">
                                    <span>So-so</span>
                                    <span className="font-medium">
                                        {reactions.mid.toLocaleString()}
                                    </span>
                                </li>
                                <li className="flex items-center justify-between py-2">
                                    <span>Not really</span>
                                    <span className="font-medium">
                                        {reactions.down.toLocaleString()}
                                    </span>
                                </li>
                            </ul>
                        </div>
                    ) : (
                        <p className="text-sm text-muted-foreground">
                            No reader feedback recorded yet.
                        </p>
                    )}
                </CardContent>
            </Card>

            {/* Written feedback — free-form notes readers left via the /feedback
                form (or the reply prompt in the send footer) for this issue. */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                        <MessagesSquare className="size-4 text-primary" />
                        Written feedback
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {isLoading || !feedback ? (
                        <div className="space-y-2">
                            <Skeleton className="h-8 w-24" />
                            <Skeleton className="h-4 w-full" />
                        </div>
                    ) : feedback.total > 0 ? (
                        <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                                <MessagesSquare className="size-6 text-primary" />
                                <span className="text-2xl font-semibold">
                                    {feedback.total.toLocaleString()}
                                </span>
                                <span className="text-sm text-muted-foreground">
                                    written {feedback.total === 1 ? "note" : "notes"}
                                </span>
                            </div>
                            <Link
                                href="/admin/feedback"
                                className="text-sm font-medium text-[#ff5c5c] hover:underline"
                            >
                                Read all →
                            </Link>
                        </div>
                    ) : (
                        <p className="text-sm text-muted-foreground">
                            No written feedback for this issue yet.
                        </p>
                    )}
                </CardContent>
            </Card>

            {/* Resend history — whether this issue has already been resent to
                its non-openers, so an editor doesn't accidentally double-resend.
                Only rendered for sent issues that have at least one resend. */}
            {n?.status === "sent" && resendData && resendData.count > 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base flex items-center gap-2">
                            <History className="size-4 text-primary" />
                            Resend history
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex items-center gap-2">
                            <MailX className="size-6 text-primary" />
                            <span className="text-2xl font-semibold">
                                {resendData.count.toLocaleString()}
                            </span>
                            <span className="text-sm text-muted-foreground">
                                {resendData.count === 1 ? "resend" : "resends"} to
                                non-openers · reached{" "}
                                {resendData.totalReached.toLocaleString()} in total
                            </span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                            This issue has already been resent to the subscribers who
                            never opened it. Only resend again if you have a genuinely
                            fresher reason — repeat resends risk annoying readers.
                        </p>
                        <ul className="divide-y text-sm">
                            {resendData.events.map((ev) => (
                                <li
                                    key={ev.id}
                                    className="flex items-center justify-between gap-3 py-2.5"
                                >
                                    <span className="flex items-center gap-2 min-w-0">
                                        <Send className="size-4 text-muted-foreground shrink-0" />
                                        <span className="truncate">
                                            {formatDateTime(ev.createdAt)}
                                            {ev.actorEmail ? (
                                                <span className="text-muted-foreground">
                                                    {" "}· {ev.actorEmail}
                                                </span>
                                            ) : null}
                                        </span>
                                    </span>
                                    <span className="font-medium shrink-0">
                                        {ev.sent.toLocaleString()} sent
                                    </span>
                                </li>
                            ))}
                        </ul>
                    </CardContent>
                </Card>
            )}

            {/* Detail breakdown */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Breakdown</CardTitle>
                </CardHeader>
                <CardContent>
                    {isLoading || !c ? (
                        <div className="space-y-2">
                            <Skeleton className="h-5 w-full" />
                            <Skeleton className="h-5 w-full" />
                            <Skeleton className="h-5 w-full" />
                        </div>
                    ) : (
                        <ul className="divide-y text-sm">
                            {[
                                { label: "Recipients", value: c.recipients, icon: <Users className="size-4 text-muted-foreground" /> },
                                { label: "Delivered", value: c.delivered, icon: <Send className="size-4 text-muted-foreground" /> },
                                { label: "Opened (unique)", value: c.opened, icon: <MailOpen className="size-4 text-muted-foreground" /> },
                                { label: "Clicked (unique)", value: c.clicked, icon: <MousePointerClick className="size-4 text-muted-foreground" /> },
                                { label: "Bounced", value: c.bounced, icon: <AlertTriangle className="size-4 text-muted-foreground" /> },
                                { label: "Complained", value: c.complained, icon: <ShieldAlert className="size-4 text-muted-foreground" /> },
                            ].map((row) => (
                                <li key={row.label} className="flex items-center justify-between py-2.5">
                                    <span className="flex items-center gap-2">
                                        {row.icon}
                                        {row.label}
                                    </span>
                                    <span className="font-medium">{row.value.toLocaleString()}</span>
                                </li>
                            ))}
                        </ul>
                    )}
                </CardContent>
            </Card>

            {/* A/B subject-line test breakdown (only for issues sent with two subjects) */}
            {ab && (
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base flex items-center gap-2">
                            <FlaskConical className="size-4 text-primary" />
                            A/B subject test
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        {ab.variants.map((v) => {
                            const isWinner = ab.winner === v.variant;
                            return (
                                <div
                                    key={v.variant}
                                    className={`rounded-lg border p-3 ${isWinner ? "border-[#ff5c5c] bg-[#ff5c5c]/5" : ""}`}
                                >
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                                                <span>Variant {v.variant}</span>
                                                {isWinner && (
                                                    <span className="inline-flex items-center gap-1 rounded-full bg-[#ff5c5c]/15 px-2 py-0.5 text-[#ff5c5c]">
                                                        <Trophy className="size-3" /> Winner
                                                    </span>
                                                )}
                                            </div>
                                            <p className="truncate text-sm font-medium mt-0.5">{v.subject}</p>
                                        </div>
                                    </div>
                                    <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4 text-sm">
                                        <div>
                                            <p className="text-xs text-muted-foreground">Recipients</p>
                                            <p className="font-medium">{v.recipients.toLocaleString()}</p>
                                        </div>
                                        <div>
                                            <p className="text-xs text-muted-foreground">Delivered</p>
                                            <p className="font-medium">{v.delivered.toLocaleString()}</p>
                                        </div>
                                        <div>
                                            <p className="text-xs text-muted-foreground">Open rate</p>
                                            <p className="font-medium">{v.openRate}% <span className="text-xs text-muted-foreground font-normal">({v.opened})</span></p>
                                        </div>
                                        <div>
                                            <p className="text-xs text-muted-foreground">Click rate</p>
                                            <p className="font-medium">{v.clickRate}% <span className="text-xs text-muted-foreground font-normal">({v.clicked})</span></p>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                        <p className="text-xs text-muted-foreground">
                            {ab.winner === null
                                ? "Winner is decided by open rate once opens start rolling in."
                                : ab.winner === "tie"
                                  ? "Both variants are tied on open rate so far."
                                  : `Variant ${ab.winner} is leading on open rate.`}
                        </p>
                    </CardContent>
                </Card>
            )}

            <p className="text-xs text-muted-foreground">
                Open &amp; click rates are measured against delivered mail. Numbers
                update as Resend delivers open/click/bounce webhook events.
            </p>
        </div>
    );
}
