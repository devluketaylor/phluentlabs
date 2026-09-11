"use client";

import { trpc } from "@/trpc/client";
import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

function formatWhen(value: unknown) {
    const d = value instanceof Date ? value : new Date(String(value));
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleString();
}

export const FeedbackTable = () => {
    const [page, setPage] = useState(0);
    const pageSize = 25;

    const list = trpc.adminNewsletter.feedbackList.useQuery(
        { limit: pageSize, offset: page * pageSize },
        { placeholderData: (prev) => prev }
    );

    const total = list.data?.total ?? 0;
    const rows = list.data?.items ?? [];
    const pageCount = Math.max(1, Math.ceil(total / pageSize));
    const rangeStart = total === 0 ? 0 : page * pageSize + 1;
    const rangeEnd = Math.min(total, page * pageSize + rows.length);

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div className="text-sm text-muted-foreground">
                    {total === 0
                        ? "No feedback yet"
                        : `${total} note${total === 1 ? "" : "s"} total`}
                </div>
                <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => list.refetch()}
                    disabled={list.isFetching}
                >
                    {list.isFetching ? "Refreshing…" : "Refresh"}
                </Button>
            </div>

            {list.isLoading && (
                <div className="space-y-2">
                    {Array.from({ length: 4 }).map((_, i) => (
                        <Card key={i} className="p-4">
                            <div className="h-4 w-40 rounded bg-muted animate-pulse" />
                            <div className="mt-2 h-4 w-full rounded bg-muted animate-pulse" />
                        </Card>
                    ))}
                </div>
            )}

            {list.error && (
                <Card className="p-4 text-sm text-destructive">{list.error.message}</Card>
            )}

            {!list.isLoading && !list.error && rows.length === 0 && (
                <Card className="flex flex-col items-center gap-1 p-12 text-center">
                    <div className="text-sm font-medium">No feedback yet</div>
                    <div className="text-sm text-muted-foreground">
                        Reader notes from the feedback form will appear here.
                    </div>
                </Card>
            )}

            <div className="space-y-3">
                {rows.map((r) => (
                    <Card key={r.id} className="p-4 space-y-2">
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                            <span>{formatWhen(r.createdAt)}</span>
                            {r.email ? (
                                <a
                                    href={`mailto:${r.email}`}
                                    className="font-medium text-[#ff5c5c] hover:underline"
                                >
                                    {r.email}
                                </a>
                            ) : (
                                <span className="italic">anonymous</span>
                            )}
                            {r.issueSubject ? (
                                <Link
                                    href={`/admin/newsletters/${r.newsletterId}`}
                                    className="inline-flex items-center rounded-full border border-[#ff5c5c]/40 bg-[#ff5c5c]/10 px-2 py-0.5 font-medium text-[#ff5c5c] hover:bg-[#ff5c5c]/20"
                                >
                                    {r.issueSubject}
                                </Link>
                            ) : r.issueSlug ? (
                                <span className="rounded-full bg-muted px-2 py-0.5">
                                    {r.issueSlug}
                                </span>
                            ) : (
                                <span className="rounded-full bg-muted px-2 py-0.5">general</span>
                            )}
                        </div>
                        <p className="whitespace-pre-wrap break-words text-sm">{r.message}</p>
                    </Card>
                ))}
            </div>

            {total > pageSize && (
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="text-sm text-muted-foreground">
                        {`Showing ${rangeStart}–${rangeEnd} of ${total}`}
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="text-sm text-muted-foreground">
                            Page {page + 1} of {pageCount}
                        </div>
                        <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => setPage((p) => Math.max(0, p - 1))}
                            disabled={page === 0 || list.isFetching}
                        >
                            Previous
                        </Button>
                        <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                            disabled={page >= pageCount - 1 || list.isFetching}
                        >
                            Next
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
};
