"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/trpc/client";
import { BarChart, LineChart } from "@/components/admin/charts";
import { Coins, Cpu, Activity, Flame, CircleCheck, CircleAlert, Clock, Bot } from "lucide-react";

function fmtNum(n: number) {
    if (n >= 1e9) return (n / 1e9).toFixed(2) + "B";
    if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
    if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
    return String(Math.round(n));
}
function fmtUsd(n: number) {
    return "$" + n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}
function fmtWhen(d: Date | string | null | undefined) {
    if (!d) return "—";
    const t = new Date(d).getTime();
    const diff = Date.now() - t;
    const abs = Math.abs(diff);
    const mins = Math.round(abs / 60000);
    const hrs = Math.round(abs / 3600000);
    const days = Math.round(abs / 86400000);
    const rel = mins < 60 ? `${mins}m` : hrs < 48 ? `${hrs}h` : `${days}d`;
    return diff >= 0 ? `${rel} ago` : `in ${rel}`;
}

type AgentFilter = "all" | "Tessie" | "Tiger";

export function UsageView() {
    const [agent, setAgent] = useState<AgentFilter>("all");
    const summary = trpc.usage.summary.useQuery(undefined, { refetchOnWindowFocus: false, refetchInterval: 60000 });
    const health = trpc.usage.health.useQuery(undefined, { refetchOnWindowFocus: false, refetchInterval: 60000 });
    const activity = trpc.usage.activity.useQuery({ limit: 60 }, { refetchOnWindowFocus: false, refetchInterval: 60000 });
    const daily = trpc.usage.daily.useQuery({ days: 30 }, { refetchOnWindowFocus: false });

    const s = summary.data;
    const h = health.data;

    if (summary.isLoading || health.isLoading) {
        return (
            <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-4">
                    {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24" />)}
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
                    No telemetry yet. The host collector pushes data every ~30 min.
                </CardContent>
            </Card>
        );
    }

    // Agent-filtered job set.
    const jobs = agent === "all" ? s.jobs : s.jobs.filter((j) => (j.agent ?? "unknown") === agent);
    const fTokens = jobs.reduce((a, j) => a + Number(j.totalTokens), 0);
    const fCost = jobs.reduce((a, j) => a + Number(j.costUsd), 0);
    const fRuns = jobs.reduce((a, j) => a + Number(j.runs), 0);

    const costBars = jobs.filter((j) => Number(j.costUsd) > 0).map((j) => ({ label: j.jobName, value: Number(j.costUsd) }));

    // Daily cost line (all agents).
    const byDay = new Map<string, number>();
    for (const r of daily.data?.rows ?? []) {
        if (agent !== "all" && (r.agent ?? "unknown") !== agent) continue;
        const key = new Date(r.day).toISOString().slice(0, 10);
        byDay.set(key, (byDay.get(key) ?? 0) + Number(r.costUsd));
    }
    const costLine = [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([day, value]) => ({ label: day.slice(5), value }));

    return (
        <div className="space-y-6">
            {/* Fleet status header */}
            <div className="grid gap-4 sm:grid-cols-4">
                <Tile icon={CircleCheck} label="Jobs healthy" value={`${h?.okJobs ?? 0}/${h?.totalJobs ?? 0}`} />
                <Tile icon={CircleAlert} label="Errors (24h)" value={String(h?.errors24h ?? 0)} alert={(h?.errors24h ?? 0) > 0} />
                <Tile icon={Activity} label="Runs (24h)" value={String(h?.runs24h ?? 0)} />
                <Tile icon={Clock} label="Next run" value={h?.nextRun ? fmtWhen(h.nextRun.at) : "—"} sub={h?.nextRun?.jobName} />
            </div>

            {/* Agent filter */}
            <div className="flex flex-wrap items-center gap-2">
                <Bot className="h-4 w-4 text-muted-foreground" />
                {(["all", "Tessie", "Tiger"] as AgentFilter[]).map((a) => {
                    const ag = s.byAgent.find((x) => x.agent === a);
                    const label = a === "all" ? "All agents" : a;
                    return (
                        <button
                            key={a}
                            onClick={() => setAgent(a)}
                            className={`px-4 py-2 text-sm border transition-colors ${
                                agent === a ? "border-foreground bg-foreground text-background" : "border-border hover:border-foreground/30"
                            }`}
                        >
                            {label}
                            {a !== "all" && <span className="ml-2 text-xs opacity-70">{ag ? fmtUsd(ag.cost) : "$0"}</span>}
                        </button>
                    );
                })}
            </div>

            {/* Spend + tokens cards */}
            <div className="grid gap-4 sm:grid-cols-4">
                <Tile icon={Coins} label="Est. cost (all-time)" value={fmtUsd(fCost)} accent />
                <Tile icon={Coins} label="This month" value={fmtUsd(daily.data?.mtdCost ?? 0)} />
                <Tile icon={Flame} label="Projected month" value={fmtUsd(daily.data?.projectedMonthCost ?? 0)} sub="at current run-rate" />
                <Tile icon={Cpu} label="Tokens" value={fmtNum(fTokens)} sub={`${fmtNum(fRuns)} runs`} />
            </div>

            {/* Health tiles per job */}
            <Card>
                <CardHeader><CardTitle className="text-base">Job health</CardTitle></CardHeader>
                <CardContent>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {(h?.jobs ?? [])
                            .filter((j) => agent === "all" || (j.agent ?? "unknown") === agent)
                            .map((j) => {
                                const ok = j.lastStatus === "ok";
                                return (
                                    <div key={j.jobId} className="border border-border p-3">
                                        <div className="flex items-center justify-between gap-2">
                                            <span className="truncate text-sm font-medium">{j.jobName}</span>
                                            <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${ok ? "bg-foreground" : "bg-destructive"}`} title={j.lastStatus ?? "unknown"} />
                                        </div>
                                        <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                                            <span>{j.agent ?? "—"}</span>
                                            <span>last {fmtWhen(j.lastRunAt)}</span>
                                            {j.nextRunAt && <span>next {fmtWhen(j.nextRunAt)}</span>}
                                            {Number(j.errors24h) > 0 && <span className="text-destructive">{j.errors24h} err/24h</span>}
                                        </div>
                                    </div>
                                );
                            })}
                    </div>
                </CardContent>
            </Card>

            {/* Cost by job + daily cost */}
            <div className="grid gap-6 lg:grid-cols-2">
                <Card>
                    <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Flame className="h-4 w-4" /> Cost by job (USD)</CardTitle></CardHeader>
                    <CardContent><BarChart data={costBars} ariaLabel="Cost by job" /></CardContent>
                </Card>
                {costLine.length > 1 && (
                    <Card>
                        <CardHeader><CardTitle className="text-base">Daily cost (30d)</CardTitle></CardHeader>
                        <CardContent><LineChart data={costLine} valueSuffix=" USD" ariaLabel="Daily cost" /></CardContent>
                    </Card>
                )}
            </div>

            {/* Activity feed */}
            <Card>
                <CardHeader><CardTitle className="text-base">Recent activity</CardTitle></CardHeader>
                <CardContent>
                    <div className="max-h-96 overflow-y-auto">
                        <table className="w-full text-sm">
                            <thead className="sticky top-0 bg-card">
                                <tr className="border-b border-border text-left text-muted-foreground">
                                    <th className="py-2 pr-4 font-medium">When</th>
                                    <th className="py-2 pr-4 font-medium">Job</th>
                                    <th className="py-2 pr-4 font-medium">Agent</th>
                                    <th className="py-2 pr-4 font-medium">Status</th>
                                    <th className="py-2 font-medium text-right">Tokens</th>
                                </tr>
                            </thead>
                            <tbody>
                                {(activity.data ?? [])
                                    .filter((r) => agent === "all" || (r.agent ?? "unknown") === agent)
                                    .map((r) => (
                                        <tr key={r.id} className="border-b border-border/50">
                                            <td className="py-2 pr-4 text-muted-foreground">{fmtWhen(r.ts)}</td>
                                            <td className="py-2 pr-4 truncate max-w-[12rem]">{r.jobName}</td>
                                            <td className="py-2 pr-4 text-muted-foreground">{r.agent ?? "—"}</td>
                                            <td className="py-2 pr-4">
                                                <span className={`inline-flex items-center gap-1 ${r.status === "ok" ? "" : "text-destructive"}`}>
                                                    <span className={`h-2 w-2 rounded-full ${r.status === "ok" ? "bg-foreground" : "bg-destructive"}`} />
                                                    {r.status ?? "—"}
                                                </span>
                                            </td>
                                            <td className="py-2 text-right">{r.tokens != null ? fmtNum(Number(r.tokens)) : "—"}</td>
                                        </tr>
                                    ))}
                            </tbody>
                        </table>
                    </div>
                    {s.lastUpdated && (
                        <p className="mt-3 text-xs text-muted-foreground">
                            Data updated {fmtWhen(s.lastUpdated)} · cost is an estimate from a per-model rate table · auto-refreshes.
                        </p>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}

function Tile({
    icon: Icon,
    label,
    value,
    sub,
    accent,
    alert,
}: {
    icon: typeof Coins;
    label: string;
    value: string;
    sub?: string | null;
    accent?: boolean;
    alert?: boolean;
}) {
    return (
        <Card>
            <CardContent className="flex items-center gap-3 py-5">
                <div className={`border p-2 ${alert ? "border-destructive text-destructive" : "border-border"}`}>
                    <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">{label}</p>
                    <p className={`text-xl font-semibold ${accent ? "text-foreground" : ""} ${alert ? "text-destructive" : ""}`}>{value}</p>
                    {sub && <p className="truncate text-xs text-muted-foreground">{sub}</p>}
                </div>
            </CardContent>
        </Card>
    );
}
