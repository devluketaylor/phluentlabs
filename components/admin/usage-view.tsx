"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/trpc/client";
import { BarChart, LineChart } from "@/components/admin/charts";
import { Coins, Cpu, Activity, Flame } from "lucide-react";

function fmtNum(n: number) {
    if (n >= 1e9) return (n / 1e9).toFixed(2) + "B";
    if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
    if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
    return String(Math.round(n));
}
function fmtUsd(n: number) {
    return "$" + n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

export function UsageView() {
    const summary = trpc.usage.summary.useQuery(undefined, { refetchOnWindowFocus: false });
    const daily = trpc.usage.daily.useQuery({ days: 30 }, { refetchOnWindowFocus: false });

    const s = summary.data;

    if (summary.isLoading) {
        return (
            <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-3">
                    {[0, 1, 2].map((i) => <Skeleton key={i} className="h-24" />)}
                </div>
                <Skeleton className="h-72 w-full" />
            </div>
        );
    }

    if (!s || s.jobs.length === 0) {
        return (
            <Card>
                <CardContent className="py-16 text-center text-muted-foreground">
                    <Cpu className="mx-auto mb-3 h-8 w-8 opacity-40" />
                    No usage data yet. The collector on the OpenClaw host pushes snapshots
                    periodically — check back shortly.
                </CardContent>
            </Card>
        );
    }

    // Cost-by-job bar data (top burners).
    const costBars = s.jobs
        .filter((j) => Number(j.costUsd) > 0)
        .map((j) => ({ label: j.jobName, value: Number(j.costUsd) }));

    // Tokens-by-job bar data.
    const tokenBars = s.jobs
        .filter((j) => Number(j.totalTokens) > 0)
        .map((j) => ({ label: j.jobName, value: Number(j.totalTokens) }));

    // Daily total cost line (summed across jobs per day).
    const byDay = new Map<string, number>();
    for (const r of daily.data ?? []) {
        const key = new Date(r.day).toISOString().slice(0, 10);
        byDay.set(key, (byDay.get(key) ?? 0) + Number(r.costUsd));
    }
    const costLine = [...byDay.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([day, value]) => ({ label: day.slice(5), value }));

    return (
        <div className="space-y-6">
            {/* Stat cards */}
            <div className="grid gap-4 sm:grid-cols-3">
                <StatCard icon={Coins} label="Est. total cost (all-time)" value={fmtUsd(s.totalCost)} accent />
                <StatCard icon={Cpu} label="Total tokens" value={fmtNum(s.totalTokens)} />
                <StatCard icon={Activity} label="Total runs" value={fmtNum(s.totalRuns)} />
            </div>

            {/* Cost by job */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                        <Flame className="h-4 w-4" /> Estimated cost by job (USD)
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <BarChart data={costBars} ariaLabel="Estimated cost by job" />
                </CardContent>
            </Card>

            {/* Tokens by job */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Tokens by job</CardTitle>
                </CardHeader>
                <CardContent>
                    <BarChart data={tokenBars} ariaLabel="Tokens by job" />
                </CardContent>
            </Card>

            {/* Cost over time */}
            {costLine.length > 1 && (
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">Daily cost (last 30 days)</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <LineChart data={costLine} valueSuffix=" USD" ariaLabel="Daily cost" />
                    </CardContent>
                </Card>
            )}

            {/* Detail table */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Per-job detail</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-border text-left text-muted-foreground">
                                    <th className="py-2 pr-4 font-medium">Job</th>
                                    <th className="py-2 pr-4 font-medium">Model</th>
                                    <th className="py-2 pr-4 font-medium text-right">Runs</th>
                                    <th className="py-2 pr-4 font-medium text-right">Tokens</th>
                                    <th className="py-2 pr-4 font-medium text-right">Avg/run</th>
                                    <th className="py-2 font-medium text-right">Est. cost</th>
                                </tr>
                            </thead>
                            <tbody>
                                {s.jobs.map((j) => (
                                    <tr key={j.jobId} className="border-b border-border/50">
                                        <td className="py-2 pr-4">{j.jobName}</td>
                                        <td className="py-2 pr-4 text-muted-foreground">{j.model ?? "—"}</td>
                                        <td className="py-2 pr-4 text-right">{fmtNum(Number(j.runs))}</td>
                                        <td className="py-2 pr-4 text-right">{fmtNum(Number(j.totalTokens))}</td>
                                        <td className="py-2 pr-4 text-right">{fmtNum(Number(j.avgTokensPerRun ?? 0))}</td>
                                        <td className="py-2 text-right">{fmtUsd(Number(j.costUsd))}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    {s.lastUpdated && (
                        <p className="mt-3 text-xs text-muted-foreground">
                            Last updated {new Date(s.lastUpdated).toLocaleString()} · cost is an
                            estimate from a per-model rate table.
                        </p>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}

function StatCard({
    icon: Icon,
    label,
    value,
    accent,
}: {
    icon: typeof Coins;
    label: string;
    value: string;
    accent?: boolean;
}) {
    return (
        <Card>
            <CardContent className="flex items-center gap-4 py-6">
                <div className="border border-border p-2">
                    <Icon className="h-5 w-5" />
                </div>
                <div>
                    <p className="text-xs text-muted-foreground">{label}</p>
                    <p className={`text-2xl font-semibold ${accent ? "text-foreground" : ""}`}>{value}</p>
                </div>
            </CardContent>
        </Card>
    );
}
