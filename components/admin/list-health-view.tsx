"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/trpc/client";
import { Clock, MailWarning, MailCheck, Snowflake } from "lucide-react";

function formatDate(ms: number | null | undefined) {
    if (!ms) return "—";
    return new Date(ms).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
    });
}

function daysSince(ms: number | null | undefined) {
    if (!ms) return null;
    return Math.floor((Date.now() - ms) / (24 * 60 * 60 * 1000));
}

export function ListHealthView() {
    const health = trpc.adminDashboard.pendingHealth.useQuery(
        { sampleLimit: 25 },
        { refetchOnWindowFocus: false },
    );

    const d = health.data;

    const cards: { label: string; value?: number; icon: typeof Clock; hint: string }[] = [
        {
            label: "Pending (total)",
            value: d?.pending,
            icon: Clock,
            hint: "Signed up but not yet confirmed",
        },
        {
            label: "Reminder queued",
            value: d?.eligibleForReminder,
            icon: MailWarning,
            hint: d ? `Eligible on the next reminder run (${d.reminderAfterDays}+ days old)` : "",
        },
        {
            label: "Reminded",
            value: d?.reminded,
            icon: MailCheck,
            hint: "Already sent the one-time confirm reminder",
        },
        {
            label: "Stale",
            value: d?.stale,
            icon: Snowflake,
            hint: d ? `Reminded + older than ${d.staleAfterDays} days` : "",
        },
    ];

    return (
        <div className="space-y-6">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {cards.map((c) => (
                    <div key={c.label} className="rounded-lg border p-4">
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <c.icon className="size-3.5" />
                            {c.label}
                        </div>
                        <p className="mt-1 text-2xl font-semibold">
                            {health.isLoading || c.value === undefined ? (
                                <Skeleton className="h-7 w-12" />
                            ) : (
                                c.value.toLocaleString()
                            )}
                        </p>
                        {c.hint && (
                            <p className="mt-1 text-[11px] leading-tight text-muted-foreground">
                                {c.hint}
                            </p>
                        )}
                    </div>
                ))}
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                        <Snowflake className="size-4 text-primary" />
                        Stale-pending cleanup candidates
                    </CardTitle>
                    <p className="text-sm text-muted-foreground">
                        Subscribers who were reminded but never confirmed and are now cold.
                        Review these here — deletion stays a manual action (select and remove
                        from the{" "}
                        <Link href="/admin/subscribers" className="text-[#ff5c5c] hover:underline">
                            Subscribers
                        </Link>{" "}
                        page). We never auto-delete anyone.
                    </p>
                </CardHeader>
                <CardContent>
                    {health.isLoading ? (
                        <div className="space-y-2">
                            <Skeleton className="h-6 w-full" />
                            <Skeleton className="h-6 w-full" />
                            <Skeleton className="h-6 w-full" />
                        </div>
                    ) : health.isError ? (
                        <p className="text-sm text-destructive">
                            {health.error?.message ?? "Failed to load list health."}
                        </p>
                    ) : !d || d.staleSample.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                            No stale-pending subscribers — your list is clean. 🎉
                        </p>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b text-left text-xs text-muted-foreground">
                                        <th className="py-2 pr-3 font-medium">Subscriber</th>
                                        <th className="py-2 px-3 font-medium text-right">Signed up</th>
                                        <th className="py-2 px-3 font-medium text-right">Reminded</th>
                                        <th className="py-2 pl-3 font-medium text-right">Age</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {d.staleSample.map((r) => {
                                        const name = [r.firstName, r.lastName]
                                            .filter(Boolean)
                                            .join(" ");
                                        const age = daysSince(r.createdAtMs);
                                        return (
                                            <tr key={r.id} className="border-b last:border-0">
                                                <td className="py-2 pr-3 min-w-0">
                                                    <Link
                                                        href={`/admin/subscribers/${r.id}`}
                                                        className="font-medium hover:text-[#ff5c5c]"
                                                    >
                                                        {r.email}
                                                    </Link>
                                                    {name && (
                                                        <div className="text-xs text-muted-foreground truncate">
                                                            {name}
                                                        </div>
                                                    )}
                                                </td>
                                                <td className="py-2 px-3 text-right text-muted-foreground tabular-nums">
                                                    {formatDate(r.createdAtMs)}
                                                </td>
                                                <td className="py-2 px-3 text-right text-muted-foreground tabular-nums">
                                                    {formatDate(r.reminderSentAtMs)}
                                                </td>
                                                <td className="py-2 pl-3 text-right text-muted-foreground tabular-nums">
                                                    {age !== null ? `${age}d` : "—"}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                            {d.stale > d.staleSample.length && (
                                <p className="mt-3 text-xs text-muted-foreground">
                                    Showing {d.staleSample.length} of {d.stale.toLocaleString()}{" "}
                                    stale-pending subscribers.
                                </p>
                            )}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
