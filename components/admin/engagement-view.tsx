"use client";

import { useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/trpc/client";
import { Sparkles, MoonStar, TrendingDown, ChevronLeft, ChevronRight } from "lucide-react";

type Cohort = "engaged" | "dormant" | "atRisk";

const PAGE_SIZE = 25;
const INACTIVE_DAYS = 60;
const MIN_SENT = 2;

function formatDate(d: Date | string | null | undefined) {
    if (!d) return "—";
    const date = typeof d === "string" ? new Date(d) : d;
    return date.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
    });
}

const cohortMeta: Record<
    Cohort,
    { label: string; blurb: string; icon: typeof Sparkles }
> = {
    engaged: {
        label: "Most engaged",
        blurb: "Your superfans — opened at least one issue, ranked by opens then clicks.",
        icon: Sparkles,
    },
    atRisk: {
        label: "At-risk",
        blurb: `Used to open, but nothing in the last ${INACTIVE_DAYS} days. Prime for a win-back.`,
        icon: TrendingDown,
    },
    dormant: {
        label: "Dormant",
        blurb: `Sent ${MIN_SENT}+ issues, never opened one. List-hygiene / re-engagement candidates.`,
        icon: MoonStar,
    },
};

export function EngagementView() {
    const [cohort, setCohort] = useState<Cohort>("engaged");
    const [page, setPage] = useState(0);

    const summary = trpc.adminSubscribers.engagementSummary.useQuery(
        { minSent: MIN_SENT, inactiveDays: INACTIVE_DAYS },
        { refetchOnWindowFocus: false }
    );

    const list = trpc.adminSubscribers.engagementList.useQuery(
        {
            cohort,
            minSent: MIN_SENT,
            inactiveDays: INACTIVE_DAYS,
            limit: PAGE_SIZE,
            offset: page * PAGE_SIZE,
        },
        { refetchOnWindowFocus: false }
    );

    const total = list.data?.total ?? 0;
    const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

    function selectCohort(next: Cohort) {
        setCohort(next);
        setPage(0);
    }

    const cards: { key: Cohort; label: string; value?: number; icon: typeof Sparkles }[] = [
        { key: "engaged", label: "Engaged", value: summary.data?.engaged, icon: Sparkles },
        { key: "atRisk", label: "At-risk", value: summary.data?.atRisk, icon: TrendingDown },
        { key: "dormant", label: "Dormant", value: summary.data?.dormant, icon: MoonStar },
    ];

    const meta = cohortMeta[cohort];

    return (
        <div className="space-y-6">
            {/* Summary cohort cards — click to filter */}
            <div className="grid gap-3 sm:grid-cols-3">
                {cards.map((c) => {
                    const active = cohort === c.key;
                    return (
                        <button
                            key={c.key}
                            type="button"
                            onClick={() => selectCohort(c.key)}
                            className={`rounded-lg border p-4 text-left transition-colors ${
                                active
                                    ? "border-[#ff5c5c] ring-1 ring-[#ff5c5c]"
                                    : "hover:border-[#ff5c5c]/50"
                            }`}
                        >
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <c.icon className="size-3.5" />
                                {c.label}
                            </div>
                            <p className="mt-1 text-2xl font-semibold">
                                {summary.isLoading || c.value === undefined ? (
                                    <Skeleton className="h-7 w-12" />
                                ) : (
                                    c.value.toLocaleString()
                                )}
                            </p>
                        </button>
                    );
                })}
            </div>

            {summary.data && (
                <p className="text-xs text-muted-foreground">
                    {summary.data.confirmed.toLocaleString()} confirmed subscribers ·
                    engagement measured from delivered issue open/click tracking.
                </p>
            )}

            <Card>
                <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                        <meta.icon className="size-4 text-primary" />
                        {meta.label}
                    </CardTitle>
                    <p className="text-sm text-muted-foreground">{meta.blurb}</p>
                </CardHeader>
                <CardContent>
                    {list.isLoading ? (
                        <div className="space-y-2">
                            <Skeleton className="h-6 w-full" />
                            <Skeleton className="h-6 w-full" />
                            <Skeleton className="h-6 w-full" />
                        </div>
                    ) : list.isError ? (
                        <p className="text-sm text-destructive">
                            {list.error?.message ?? "Failed to load engagement."}
                        </p>
                    ) : !list.data || list.data.rows.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                            No subscribers in this cohort yet.
                        </p>
                    ) : (
                        <>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b text-left text-xs text-muted-foreground">
                                            <th className="py-2 pr-3 font-medium">Subscriber</th>
                                            <th className="py-2 px-3 font-medium text-right">Sent</th>
                                            <th className="py-2 px-3 font-medium text-right">Open rate</th>
                                            <th className="py-2 px-3 font-medium text-right">Click rate</th>
                                            <th className="py-2 pl-3 font-medium text-right">Last engaged</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {list.data.rows.map((r) => {
                                            const name = [r.firstName, r.lastName]
                                                .filter(Boolean)
                                                .join(" ");
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
                                                    <td className="py-2 px-3 text-right tabular-nums">
                                                        {r.sent}
                                                    </td>
                                                    <td className="py-2 px-3 text-right tabular-nums">
                                                        {Math.round(r.openRate * 100)}%
                                                    </td>
                                                    <td className="py-2 px-3 text-right tabular-nums">
                                                        {Math.round(r.clickRate * 100)}%
                                                    </td>
                                                    <td className="py-2 pl-3 text-right text-muted-foreground">
                                                        {formatDate(r.lastEngagedAt)}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>

                            <div className="mt-4 flex items-center justify-between">
                                <p className="text-xs text-muted-foreground">
                                    {total.toLocaleString()} in cohort · page {page + 1} of{" "}
                                    {pageCount}
                                </p>
                                <div className="flex items-center gap-2">
                                    <Button
                                        variant="secondary"
                                        size="sm"
                                        disabled={page === 0}
                                        onClick={() => setPage((p) => Math.max(0, p - 1))}
                                    >
                                        <ChevronLeft className="size-4" />
                                        Prev
                                    </Button>
                                    <Button
                                        variant="secondary"
                                        size="sm"
                                        disabled={page + 1 >= pageCount}
                                        onClick={() => setPage((p) => p + 1)}
                                    >
                                        Next
                                        <ChevronRight className="size-4" />
                                    </Button>
                                </div>
                            </div>
                        </>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
