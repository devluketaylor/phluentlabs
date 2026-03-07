"use client";

import { useState } from "react";
import Link from "next/link";
import { trpc } from "@/trpc/client";
import {
    Pagination,
    PaginationContent,
    PaginationEllipsis,
    PaginationItem,
    PaginationLink,
    PaginationNext,
    PaginationPrevious,
} from "@/components/ui/pagination";

export function NewsletterList() {
    const [page, setPage] = useState(1);
    const { data, isLoading } = trpc.newsletter.list.useQuery({ page });

    const totalPages = data ? Math.ceil(data.total / data.pageSize) : 1;

    if (isLoading) {
        return (
            <div className="space-y-3">
                {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="h-20 rounded-xl border bg-muted animate-pulse" />
                ))}
            </div>
        );
    }

    if (!data?.items.length) {
        return (
            <p className="text-sm text-muted-foreground text-center py-10">
                No issues yet — check back soon.
            </p>
        );
    }

    const getPageNumbers = () => {
        if (totalPages <= 5) return Array.from({ length: totalPages }, (_, i) => i + 1);
        if (page <= 3) return [1, 2, 3, 4, "...", totalPages];
        if (page >= totalPages - 2) return [1, "...", totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
        return [1, "...", page - 1, page, page + 1, "...", totalPages];
    };

    const filter = data.items.filter((item) => item.status === "sent")

    return (
        <div className="space-y-6">
            <ul className="space-y-3">
                {filter.map((issue) => (
                    <li key={issue.id}>
                        <Link
                            href={`/issues/${issue.slug ?? issue.id}`}
                            className="group flex items-start justify-between gap-4 rounded-xl border p-4 hover:bg-muted/50 transition-colors"
                        >
                            <div className="flex flex-col gap-1 min-w-0">
                                <span className="font-medium text-sm group-hover:text-primary transition-colors truncate">
                                    {issue.subject}
                                </span>
                                {issue.preheader && (
                                    <span className="text-sm text-muted-foreground line-clamp-1">
                                        {issue.preheader}
                                    </span>
                                )}
                            </div>
                            <span className="text-xs text-muted-foreground whitespace-nowrap pt-0.5 shrink-0">
                                {new Date(issue.createdAt).toLocaleDateString(undefined, {
                                    month: "short",
                                    day: "numeric",
                                    year: "numeric",
                                })}
                            </span>
                        </Link>
                    </li>
                ))}
            </ul>

            {totalPages > 1 && (
                <Pagination>
                    <PaginationContent>
                        <PaginationItem>
                            <PaginationPrevious
                                // size={"icon"}
                                onClick={() => setPage((p) => Math.max(1, p - 1))}
                                // disabled={page === 1}
                            />
                        </PaginationItem>

                        {getPageNumbers().map((p, i) =>
                            p === "..." ? (
                                <PaginationItem key={`ellipsis-${i}`}>
                                    <PaginationEllipsis />
                                </PaginationItem>
                            ) : (
                                <PaginationItem key={p}>
                                    <PaginationLink
                                        // size={"icon"}
                                        isActive={page === p}
                                        onClick={() => setPage(p as number)}
                                    >
                                        {p}
                                    </PaginationLink>
                                </PaginationItem>
                            )
                        )}

                        <PaginationItem>
                            <PaginationNext
                                // size={"icon"}
                                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                                // disabled={page === totalPages}
                            />
                        </PaginationItem>
                    </PaginationContent>
                </Pagination>
            )}
        </div>
    );
}
