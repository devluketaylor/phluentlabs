"use client";

import * as React from "react";
import Link from "next/link";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
    Pagination,
    PaginationContent,
    PaginationEllipsis,
    PaginationItem,
    PaginationLink,
    PaginationNext,
    PaginationPrevious,
} from "@/components/ui/pagination";

export type ArchiveIssue = {
    id: string;
    slug: string;
    subject: string;
    preheader: string | null;
    dateMs: number;
    readingMinutes: number;
};

function formatDate(ms: number) {
    return new Date(ms).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
    });
}

export function IssuesArchive({
    issues,
    pageSize = 20,
}: {
    issues: ArchiveIssue[];
    pageSize?: number;
}) {
    const [query, setQuery] = React.useState("");
    const [page, setPage] = React.useState(1);

    // Filter by subject + preheader. Cheap client-side search across the (capped)
    // published set — no extra network round-trips as the user types.
    const filtered = React.useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return issues;
        return issues.filter((i) => {
            const hay = `${i.subject} ${i.preheader ?? ""}`.toLowerCase();
            return hay.includes(q);
        });
    }, [issues, query]);

    // Reset to page 1 whenever the query changes so results aren't hidden past
    // the end of a stale page.
    React.useEffect(() => {
        setPage(1);
    }, [query]);

    const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
    const safePage = Math.min(page, totalPages);
    const start = (safePage - 1) * pageSize;
    const visible = filtered.slice(start, start + pageSize);

    const getPageNumbers = (): (number | "...")[] => {
        if (totalPages <= 5) return Array.from({ length: totalPages }, (_, i) => i + 1);
        if (safePage <= 3) return [1, 2, 3, 4, "...", totalPages];
        if (safePage >= totalPages - 2)
            return [1, "...", totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
        return [1, "...", safePage - 1, safePage, safePage + 1, "...", totalPages];
    };

    if (!issues.length) {
        return (
            <p className="py-16 text-center text-sm text-muted-foreground">
                No issues yet — check back soon.
            </p>
        );
    }

    return (
        <div className="space-y-6">
            <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search issues…"
                    aria-label="Search issues"
                    className="pl-9 pr-9"
                />
                {query && (
                    <button
                        type="button"
                        onClick={() => setQuery("")}
                        aria-label="Clear search"
                        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground"
                    >
                        <X className="h-4 w-4" />
                    </button>
                )}
            </div>

            {filtered.length === 0 ? (
                <p className="py-12 text-center text-sm text-muted-foreground">
                    No issues match{" "}
                    <span className="font-medium text-foreground">“{query}”</span>.
                </p>
            ) : (
                <>
                    <ul className="space-y-3">
                        {visible.map((issue) => (
                            <li key={issue.id}>
                                <Link
                                    href={`/issues/${issue.slug}`}
                                    className="group flex items-start justify-between gap-4 rounded-xl border p-4 transition-colors hover:bg-muted/50"
                                >
                                    <div className="flex min-w-0 flex-col gap-1">
                                        <span className="truncate text-sm font-medium transition-colors group-hover:text-primary">
                                            {issue.subject}
                                        </span>
                                        {issue.preheader && (
                                            <span className="line-clamp-1 text-sm text-muted-foreground">
                                                {issue.preheader}
                                            </span>
                                        )}
                                        <span className="text-xs text-muted-foreground">
                                            {issue.readingMinutes} min read
                                        </span>
                                    </div>
                                    <time
                                        className="shrink-0 whitespace-nowrap pt-0.5 text-xs text-muted-foreground"
                                        dateTime={new Date(issue.dateMs).toISOString()}
                                    >
                                        {formatDate(issue.dateMs)}
                                    </time>
                                </Link>
                            </li>
                        ))}
                    </ul>

                    {totalPages > 1 && (
                        <Pagination>
                            <PaginationContent>
                                <PaginationItem>
                                    <PaginationPrevious
                                        onClick={() => setPage((p) => Math.max(1, p - 1))}
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
                                                isActive={safePage === p}
                                                onClick={() => setPage(p as number)}
                                            >
                                                {p}
                                            </PaginationLink>
                                        </PaginationItem>
                                    )
                                )}

                                <PaginationItem>
                                    <PaginationNext
                                        onClick={() =>
                                            setPage((p) => Math.min(totalPages, p + 1))
                                        }
                                    />
                                </PaginationItem>
                            </PaginationContent>
                        </Pagination>
                    )}
                </>
            )}
        </div>
    );
}
