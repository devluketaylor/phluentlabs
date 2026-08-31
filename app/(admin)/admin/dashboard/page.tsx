"use client";

import { FormHeader } from "@/components/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { trpc } from "@/trpc/client";
import {
    LayoutDashboard,
    Users,
    TrendingUp,
    TrendingDown,
    Send,
    CalendarClock,
    Newspaper,
    MailOpen,
    MousePointerClick,
    AlertTriangle,
    BarChart3,
} from "lucide-react";
import Link from "next/link";

function formatDate(d: Date | string | null | undefined) {
    if (!d) return "—";
    const date = typeof d === "string" ? new Date(d) : d;
    return date.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
    });
}

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
    icon,
    sub,
}: {
    label: string;
    value: React.ReactNode;
    icon: React.ReactNode;
    sub?: React.ReactNode;
}) {
    return (
        <Card>
            <CardContent className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">{label}</p>
                    <p className="text-2xl font-semibold">{value}</p>
                    {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
                </div>
                <div className="text-primary shrink-0">{icon}</div>
            </CardContent>
        </Card>
    );
}

export default function DashboardPage() {
    const { data, isLoading, isError, error, refetch, isFetching } =
        trpc.adminDashboard.stats.useQuery(undefined, {
            refetchOnWindowFocus: false,
        });

    const analytics = trpc.adminDashboard.sendAnalytics.useQuery(undefined, {
        refetchOnWindowFocus: false,
    });

    return (
        <div className="max-w-5xl mx-auto pt-8 pb-16 px-4 space-y-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <FormHeader
                    icon={<LayoutDashboard />}
                    title="Dashboard"
                    description="Overview of subscribers, growth, and newsletter sends."
                />
                <Button
                    variant="secondary"
                    onClick={() => refetch()}
                    disabled={isFetching}
                    className="self-start sm:self-auto"
                >
                    {isFetching ? "Refreshing…" : "Refresh"}
                </Button>
            </div>

            {isError && (
                <Card>
                    <CardContent className="text-sm text-destructive">
                        Failed to load stats: {error?.message ?? "Unknown error"}
                    </CardContent>
                </Card>
            )}

            {/* Headline stat cards */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {isLoading || !data ? (
                    Array.from({ length: 4 }).map((_, i) => (
                        <Card key={i}>
                            <CardContent>
                                <Skeleton className="h-4 w-24" />
                                <Skeleton className="mt-2 h-7 w-16" />
                            </CardContent>
                        </Card>
                    ))
                ) : (
                    <>
                        <StatCard
                            label="Total subscribers"
                            value={data.totalSubscribers.toLocaleString()}
                            icon={<Users className="size-6" />}
                            sub={`${data.statusBreakdown.subscribed.toLocaleString()} confirmed`}
                        />
                        <StatCard
                            label="New this week"
                            value={data.growth.newThisWeek.toLocaleString()}
                            icon={
                                data.growth.delta >= 0 ? (
                                    <TrendingUp className="size-6" />
                                ) : (
                                    <TrendingDown className="size-6" />
                                )
                            }
                            sub={
                                <span
                                    className={
                                        data.growth.delta > 0
                                            ? "text-[#ff5c5c]"
                                            : data.growth.delta < 0
                                              ? "text-muted-foreground"
                                              : "text-muted-foreground"
                                    }
                                >
                                    {data.growth.delta >= 0 ? "▲" : "▼"}{" "}
                                    {Math.abs(data.growth.delta).toLocaleString()} vs prior 7 days
                                </span>
                            }
                        />
                        <StatCard
                            label="Newsletters"
                            value={data.totalNewsletters.toLocaleString()}
                            icon={<Newspaper className="size-6" />}
                            sub={`${data.scheduledQueue.length.toLocaleString()} scheduled`}
                        />
                        <StatCard
                            label="Last send"
                            value={
                                data.lastSend
                                    ? data.lastSend.sentCount.toLocaleString()
                                    : "—"
                            }
                            icon={<Send className="size-6" />}
                            sub={
                                data.lastSend
                                    ? `delivered · ${formatDate(data.lastSend.sentAt)}`
                                    : "No sends yet"
                            }
                        />
                    </>
                )}
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
                {/* Status breakdown */}
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">Subscriber status</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        {isLoading || !data ? (
                            <>
                                <Skeleton className="h-5 w-full" />
                                <Skeleton className="h-5 w-full" />
                                <Skeleton className="h-5 w-full" />
                            </>
                        ) : (
                            (["subscribed", "pending", "unsubscribed"] as const).map((s) => {
                                const val = data.statusBreakdown[s];
                                const total = data.totalSubscribers || 1;
                                const pct = Math.round((val / total) * 100);
                                return (
                                    <div key={s} className="space-y-1">
                                        <div className="flex items-center justify-between text-sm">
                                            <span className="capitalize">{s}</span>
                                            <span className="text-muted-foreground">
                                                {val.toLocaleString()} ({pct}%)
                                            </span>
                                        </div>
                                        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                                            <div
                                                className="h-full rounded-full bg-[#ff5c5c]"
                                                style={{ width: `${pct}%` }}
                                            />
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </CardContent>
                </Card>

                {/* Last send detail */}
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">Last newsletter sent</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {isLoading || !data ? (
                            <div className="space-y-2">
                                <Skeleton className="h-5 w-3/4" />
                                <Skeleton className="h-4 w-1/2" />
                            </div>
                        ) : data.lastSend ? (
                            <div className="space-y-3">
                                <div>
                                    {data.lastSend.slug ? (
                                        <Link
                                            href={`/issues/${data.lastSend.slug}`}
                                            className="font-medium hover:text-[#ff5c5c]"
                                        >
                                            {data.lastSend.subject}
                                        </Link>
                                    ) : (
                                        <span className="font-medium">
                                            {data.lastSend.subject}
                                        </span>
                                    )}
                                    <p className="text-xs text-muted-foreground">
                                        {formatDateTime(data.lastSend.sentAt)}
                                    </p>
                                </div>
                                <div className="grid grid-cols-3 gap-2 text-center">
                                    <div className="rounded-md border py-2">
                                        <p className="text-lg font-semibold">
                                            {data.lastSend.totalRecipients.toLocaleString()}
                                        </p>
                                        <p className="text-xs text-muted-foreground">
                                            Recipients
                                        </p>
                                    </div>
                                    <div className="rounded-md border py-2">
                                        <p className="text-lg font-semibold text-[#ff5c5c]">
                                            {data.lastSend.sentCount.toLocaleString()}
                                        </p>
                                        <p className="text-xs text-muted-foreground">
                                            Delivered
                                        </p>
                                    </div>
                                    <div className="rounded-md border py-2">
                                        <p className="text-lg font-semibold">
                                            {data.lastSend.failedCount.toLocaleString()}
                                        </p>
                                        <p className="text-xs text-muted-foreground">
                                            Failed
                                        </p>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <p className="text-sm text-muted-foreground">
                                No newsletters have been sent yet.
                            </p>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* Send analytics (aggregate across recent sends) */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                        <BarChart3 className="size-4 text-primary" />
                        Send analytics
                        <span className="text-xs font-normal text-muted-foreground">
                            (recent sends)
                        </span>
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    {analytics.isLoading || !analytics.data ? (
                        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                            {Array.from({ length: 4 }).map((_, i) => (
                                <Skeleton key={i} className="h-16 w-full" />
                            ))}
                        </div>
                    ) : analytics.data.totals.recipients === 0 ? (
                        <p className="text-sm text-muted-foreground">
                            No send analytics yet. Once issues are sent and Resend
                            reports opens/clicks, aggregate rates appear here.
                        </p>
                    ) : (
                        <>
                            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                                <div className="rounded-md border p-3">
                                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                        <Send className="size-3.5" /> Delivered
                                    </div>
                                    <p className="mt-1 text-xl font-semibold">
                                        {analytics.data.rates.deliveryRate}%
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                        {analytics.data.totals.delivered.toLocaleString()} of{" "}
                                        {analytics.data.totals.recipients.toLocaleString()}
                                    </p>
                                </div>
                                <div className="rounded-md border p-3">
                                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                        <MailOpen className="size-3.5" /> Open rate
                                    </div>
                                    <p className="mt-1 text-xl font-semibold text-[#ff5c5c]">
                                        {analytics.data.rates.openRate}%
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                        {analytics.data.totals.opened.toLocaleString()} opened
                                    </p>
                                </div>
                                <div className="rounded-md border p-3">
                                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                        <MousePointerClick className="size-3.5" /> Click rate
                                    </div>
                                    <p className="mt-1 text-xl font-semibold">
                                        {analytics.data.rates.clickRate}%
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                        {analytics.data.totals.clicked.toLocaleString()} clicked
                                    </p>
                                </div>
                                <div className="rounded-md border p-3">
                                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                        <AlertTriangle className="size-3.5" /> Bounce rate
                                    </div>
                                    <p className="mt-1 text-xl font-semibold">
                                        {analytics.data.rates.bounceRate}%
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                        {analytics.data.totals.bounced.toLocaleString()} bounced
                                    </p>
                                </div>
                            </div>

                            <ul className="divide-y">
                                {analytics.data.issues.map((iss) => (
                                    <li
                                        key={iss.id}
                                        className="flex flex-col gap-1 py-2.5 sm:flex-row sm:items-center sm:justify-between"
                                    >
                                        <Link
                                            href={`/admin/newsletters/${iss.id}`}
                                            className="min-w-0 truncate font-medium hover:text-[#ff5c5c]"
                                        >
                                            {iss.subject}
                                        </Link>
                                        <div className="flex items-center gap-4 text-xs text-muted-foreground whitespace-nowrap">
                                            <span>{iss.openRate}% open</span>
                                            <span>{iss.clickRate}% click</span>
                                            <span>{iss.recipients.toLocaleString()} sent</span>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        </>
                    )}
                </CardContent>
            </Card>

            {/* Scheduled queue */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                        <CalendarClock className="size-4 text-primary" />
                        Scheduled queue
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {isLoading || !data ? (
                        <div className="space-y-2">
                            <Skeleton className="h-5 w-full" />
                            <Skeleton className="h-5 w-full" />
                        </div>
                    ) : data.scheduledQueue.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                            Nothing scheduled. Schedule an issue from the{" "}
                            <Link
                                href="/admin/newsletters"
                                className="underline hover:text-[#ff5c5c]"
                            >
                                Newsletters
                            </Link>{" "}
                            page.
                        </p>
                    ) : (
                        <ul className="divide-y">
                            {data.scheduledQueue.map((n) => (
                                <li
                                    key={n.id}
                                    className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between"
                                >
                                    <span className="font-medium">{n.subject}</span>
                                    <span className="text-sm text-muted-foreground">
                                        {formatDateTime(n.scheduledAt)}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
