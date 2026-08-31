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
} from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";

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

    const { data, isLoading, isError, error, refetch, isFetching } =
        trpc.adminNewsletter.analytics.useQuery(
            { id },
            { refetchOnWindowFocus: false, retry: false }
        );

    const n = data?.newsletter;
    const c = data?.counts;
    const r = data?.rates;

    return (
        <div className="max-w-4xl mx-auto pt-8 pb-16 px-4 space-y-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <FormHeader
                    icon={<BarChart3 />}
                    title="Issue analytics"
                    description="Delivery + engagement for a single newsletter."
                />
                <div className="flex items-center gap-2 self-start sm:self-auto">
                    <Button variant="secondary" asChild>
                        <Link href="/admin/newsletters">
                            <ArrowLeft className="size-4" />
                            Back
                        </Link>
                    </Button>
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

            <p className="text-xs text-muted-foreground">
                Open &amp; click rates are measured against delivered mail. Numbers
                update as Resend delivers open/click/bounce webhook events.
            </p>
        </div>
    );
}
