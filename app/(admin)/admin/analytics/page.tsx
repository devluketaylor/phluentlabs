"use client";

import { FormHeader } from "@/components/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { trpc } from "@/trpc/client";
import { LineChart as LineChartIcon, TrendingUp, Trophy, FlaskConical, Clock } from "lucide-react";
import Link from "next/link";
import { LineChart, BarChart, DualLineChart } from "@/components/admin/charts";

function formatDate(d: Date | string | null | undefined) {
    if (!d) return "—";
    const date = typeof d === "string" ? new Date(d) : d;
    return date.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
    });
}

export default function AnalyticsPage() {
    const { data, isLoading, isError, error, refetch, isFetching } =
        trpc.adminDashboard.timeseries.useQuery(undefined, {
            refetchOnWindowFocus: false,
        });

    // Show the most recent ~12 issues on the engagement timeline so labels stay
    // readable; the underlying query returns full history.
    const perf = data ? data.performance.slice(-12) : [];

    const {
        data: sendTime,
        isLoading: sendTimeLoading,
    } = trpc.adminDashboard.sendTimeInsights.useQuery(undefined, {
        refetchOnWindowFocus: false,
    });

    // Max open-count in the 7x24 matrix, for heatmap cell shading.
    const heatMax =
        sendTime && sendTime.matrix.length
            ? Math.max(1, ...sendTime.matrix.flat())
            : 1;

    return (
        <div className="max-w-5xl mx-auto pt-8 pb-16 px-4 space-y-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <FormHeader
                    icon={<LineChartIcon />}
                    title="Analytics"
                    description="Growth and performance over time."
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
                        Failed to load analytics: {error?.message ?? "Unknown error"}
                    </CardContent>
                </Card>
            )}

            {/* Subscriber growth over time */}
            <div className="grid gap-4 lg:grid-cols-2">
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base flex items-center gap-2">
                            <TrendingUp className="size-4 text-primary" />
                            Net-new subscribers / week
                            <span className="text-xs font-normal text-muted-foreground">
                                (last 12 weeks)
                            </span>
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {isLoading || !data ? (
                            <Skeleton className="h-40 w-full" />
                        ) : (
                            <BarChart
                                data={data.growth.map((g) => ({
                                    label: g.label,
                                    value: g.netNew,
                                }))}
                                ariaLabel="Net-new subscribers per week"
                            />
                        )}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="text-base flex items-center gap-2">
                            <TrendingUp className="size-4 text-primary" />
                            Cumulative growth
                            <span className="text-xs font-normal text-muted-foreground">
                                (last 12 weeks)
                            </span>
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {isLoading || !data ? (
                            <Skeleton className="h-40 w-full" />
                        ) : (
                            <LineChart
                                data={data.growth.map((g) => ({
                                    label: g.label,
                                    value: g.cumulative,
                                }))}
                                ariaLabel="Cumulative new subscribers over the window"
                            />
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* Open / click rate per issue over time */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                        <LineChartIcon className="size-4 text-primary" />
                        Open &amp; click rate per issue
                        <span className="text-xs font-normal text-muted-foreground">
                            (chronological)
                        </span>
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {isLoading || !data ? (
                        <Skeleton className="h-44 w-full" />
                    ) : !data.hasSends ? (
                        <p className="text-sm text-muted-foreground">
                            No sends yet. Once issues go out and Resend reports
                            opens/clicks, engagement over time appears here.
                        </p>
                    ) : (
                        <DualLineChart
                            labels={perf.map((p) =>
                                p.sentAt
                                    ? new Date(p.sentAt).toLocaleDateString(undefined, {
                                          month: "short",
                                          day: "numeric",
                                      })
                                    : ""
                            )}
                            seriesA={{
                                name: "Open rate",
                                values: perf.map((p) => p.openRate),
                            }}
                            seriesB={{
                                name: "Click rate",
                                values: perf.map((p) => p.clickRate),
                            }}
                            ariaLabel="Open and click rate per issue over time"
                        />
                    )}
                </CardContent>
            </Card>

            {/* Send-time optimization insights */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                        <Clock className="size-4 text-primary" />
                        Best time to send
                        <span className="text-xs font-normal text-muted-foreground">
                            (when readers open, your timezone)
                        </span>
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-5">
                    {sendTimeLoading || !sendTime ? (
                        <Skeleton className="h-40 w-full" />
                    ) : sendTime.totalOpens === 0 ? (
                        <p className="text-sm text-muted-foreground">
                            No opens recorded yet. Once issues go out and Resend
                            reports opens, your audience&rsquo;s peak engagement
                            windows will appear here to guide when to send.
                        </p>
                    ) : (
                        <>
                            <div className="rounded-lg border border-[#ff5c5c]/30 bg-[#ff5c5c]/10 p-4">
                                {sendTime.hasSignal ? (
                                    <p className="text-sm">
                                        <span className="font-semibold text-[#ff5c5c]">
                                            Recommended send window:
                                        </span>{" "}
                                        <span className="font-medium text-foreground">
                                            {sendTime.recommendation.day}s around{" "}
                                            {sendTime.recommendation.windowLabel}
                                        </span>{" "}
                                        <span className="text-muted-foreground">
                                            — opens cluster hardest then (
                                            {sendTime.totalOpens.toLocaleString()} opens
                                            analyzed).
                                        </span>
                                    </p>
                                ) : (
                                    <p className="text-sm text-muted-foreground">
                                        Only {sendTime.totalOpens.toLocaleString()} opens so
                                        far — the chart below hints at your
                                        audience&rsquo;s rhythm, but we&rsquo;ll make a
                                        confident recommendation once more engagement
                                        accumulates.
                                    </p>
                                )}
                            </div>

                            {/* Opens-by-hour distribution */}
                            <div>
                                <p className="mb-2 text-xs font-medium text-muted-foreground">
                                    Opens by hour of day
                                </p>
                                <BarChart
                                    data={sendTime.byHour
                                        .filter((_, i) => i % 2 === 0)
                                        .map((b) => ({
                                            label: b.label,
                                            value: b.opens,
                                        }))}
                                    ariaLabel="Opens by hour of day"
                                />
                            </div>

                            {/* Day x hour heatmap */}
                            <div>
                                <p className="mb-2 text-xs font-medium text-muted-foreground">
                                    Open heatmap (day &times; hour)
                                </p>
                                <div className="overflow-x-auto">
                                    <table className="border-separate border-spacing-0.5">
                                        <thead>
                                            <tr>
                                                <th className="w-8" />
                                                {Array.from({ length: 24 }, (_, h) => (
                                                    <th
                                                        key={h}
                                                        className="w-4 text-[9px] font-normal text-muted-foreground"
                                                    >
                                                        {h % 6 === 0 ? h : ""}
                                                    </th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {sendTime.matrix.map((row, day) => (
                                                <tr key={day}>
                                                    <td className="pr-1 text-[10px] text-muted-foreground">
                                                        {sendTime.dayNames[day]}
                                                    </td>
                                                    {row.map((cnt, hour) => {
                                                        const intensity =
                                                            cnt === 0
                                                                ? 0
                                                                : 0.15 +
                                                                  0.85 * (cnt / heatMax);
                                                        return (
                                                            <td
                                                                key={hour}
                                                                title={`${sendTime.dayNames[day]} ${sendTime.byHour[hour].label}: ${cnt} open${cnt === 1 ? "" : "s"}`}
                                                                className="h-4 w-4 rounded-sm"
                                                                style={{
                                                                    backgroundColor:
                                                                        cnt === 0
                                                                            ? "var(--muted)"
                                                                            : `rgba(255, 92, 92, ${intensity})`,
                                                                }}
                                                            />
                                                        );
                                                    })}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                                <p className="mt-2 text-[10px] text-muted-foreground">
                                    Darker coral = more opens. Hours are in your
                                    timezone, matching the schedule picker.
                                </p>
                            </div>
                        </>
                    )}
                </CardContent>
            </Card>

            <div className="grid gap-4 lg:grid-cols-2">
                {/* Best-performing issues */}
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base flex items-center gap-2">
                            <Trophy className="size-4 text-primary" />
                            Best-performing issues
                            <span className="text-xs font-normal text-muted-foreground">
                                (by open rate)
                            </span>
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {isLoading || !data ? (
                            <div className="space-y-2">
                                <Skeleton className="h-5 w-full" />
                                <Skeleton className="h-5 w-full" />
                                <Skeleton className="h-5 w-full" />
                            </div>
                        ) : data.bestIssues.length === 0 ? (
                            <p className="text-sm text-muted-foreground">
                                Not enough send data yet (needs at least one issue
                                sent to 5+ recipients).
                            </p>
                        ) : (
                            <ol className="space-y-2.5">
                                {data.bestIssues.map((iss, i) => (
                                    <li
                                        key={iss.id}
                                        className="flex items-center gap-3"
                                    >
                                        <span className="text-sm font-semibold text-muted-foreground w-4 shrink-0">
                                            {i + 1}
                                        </span>
                                        <div className="min-w-0 flex-1">
                                            <Link
                                                href={`/admin/newsletters/${iss.id}`}
                                                className="block truncate text-sm font-medium hover:text-[#ff5c5c]"
                                            >
                                                {iss.subject}
                                            </Link>
                                            <p className="text-xs text-muted-foreground">
                                                {formatDate(iss.sentAt)} ·{" "}
                                                {iss.recipients.toLocaleString()} sent
                                            </p>
                                        </div>
                                        <span className="text-sm font-semibold text-[#ff5c5c] whitespace-nowrap">
                                            {iss.openRate}% open
                                        </span>
                                    </li>
                                ))}
                            </ol>
                        )}
                    </CardContent>
                </Card>

                {/* A/B subject-line winner history */}
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base flex items-center gap-2">
                            <FlaskConical className="size-4 text-primary" />
                            A/B subject-line history
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {isLoading || !data ? (
                            <div className="space-y-2">
                                <Skeleton className="h-12 w-full" />
                                <Skeleton className="h-12 w-full" />
                            </div>
                        ) : data.abHistory.length === 0 ? (
                            <p className="text-sm text-muted-foreground">
                                No A/B tests run yet. Add a second subject line to an
                                issue before sending to test which lands better.
                            </p>
                        ) : (
                            <ul className="divide-y">
                                {data.abHistory.map((ab) => (
                                    <li key={ab.id} className="py-2.5 space-y-1">
                                        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                                            <span>{formatDate(ab.sentAt)}</span>
                                            {ab.winner && (
                                                <span
                                                    className={
                                                        ab.winner === "tie"
                                                            ? "rounded-full bg-muted px-2 py-0.5 font-medium"
                                                            : "rounded-full bg-[#ff5c5c]/15 px-2 py-0.5 font-medium text-[#ff5c5c]"
                                                    }
                                                >
                                                    {ab.winner === "tie"
                                                        ? "Tie"
                                                        : `Winner: ${ab.winner}`}
                                                </span>
                                            )}
                                        </div>
                                        <div className="grid grid-cols-2 gap-2 text-xs">
                                            <div
                                                className={
                                                    ab.winner === "A"
                                                        ? "rounded-md border border-[#ff5c5c]/40 p-2"
                                                        : "rounded-md border p-2"
                                                }
                                            >
                                                <p className="truncate font-medium" title={ab.subject}>
                                                    A: {ab.subject}
                                                </p>
                                                <p className="text-muted-foreground">
                                                    {ab.aOpenRate}% open ·{" "}
                                                    {ab.aRecipients.toLocaleString()} sent
                                                </p>
                                            </div>
                                            <div
                                                className={
                                                    ab.winner === "B"
                                                        ? "rounded-md border border-[#ff5c5c]/40 p-2"
                                                        : "rounded-md border p-2"
                                                }
                                            >
                                                <p className="truncate font-medium" title={ab.subjectB}>
                                                    B: {ab.subjectB}
                                                </p>
                                                <p className="text-muted-foreground">
                                                    {ab.bOpenRate}% open ·{" "}
                                                    {ab.bRecipients.toLocaleString()} sent
                                                </p>
                                            </div>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
