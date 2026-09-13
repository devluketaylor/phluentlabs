"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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

export type ArchivePublication = {
    slug: string;
    name: string;
    isPrimary: boolean;
    issueCount: number;
};

// Build a /issues URL preserving/clearing q + page + publication. Omitting empty
// params keeps the canonical plain-archive URL clean (/issues rather than
// /issues?q=&page=1).
function issuesHref(q: string, page: number, publication?: string | null) {
    const params = new URLSearchParams();
    if (publication) params.set("publication", publication);
    if (q) params.set("q", q);
    if (page > 1) params.set("page", String(page));
    const qs = params.toString();
    return qs ? `/issues?${qs}` : "/issues";
}

/**
 * Server-driven archive search + pagination. The actual filtering + paging
 * happens server-side (see app/(app)/issues/page.tsx) so it scales past any
 * client cap and /issues?q=… is a real, shareable, crawlable search URL wired
 * into the WebSite SearchAction. This component only reflects the server results
 * and pushes query/page changes into the URL.
 */
export function IssuesArchive({
    issues,
    total,
    page,
    pageSize = 20,
    query,
    publications = [],
    activePublication = null,
}: {
    issues: ArchiveIssue[];
    total: number;
    page: number;
    pageSize?: number;
    query: string;
    publications?: ArchivePublication[];
    activePublication?: string | null;
}) {
    const router = useRouter();
    const [value, setValue] = React.useState(query);

    // Keep the input in sync if the URL query changes (e.g. back/forward nav).
    React.useEffect(() => {
        setValue(query);
    }, [query]);

    const submit = React.useCallback(
        (next: string) => {
            const trimmed = next.trim();
            // New search always resets to page 1 (keep the active publication).
            router.push(issuesHref(trimmed, 1, activePublication));
        },
        [router, activePublication]
    );

    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const safePage = Math.min(Math.max(1, page), totalPages);

    const getPageNumbers = (): (number | "...")[] => {
        if (totalPages <= 5) return Array.from({ length: totalPages }, (_, i) => i + 1);
        if (safePage <= 3) return [1, 2, 3, 4, "...", totalPages];
        if (safePage >= totalPages - 2)
            return [1, "...", totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
        return [1, "...", safePage - 1, safePage, safePage + 1, "...", totalPages];
    };

    const goto = (p: number) => router.push(issuesHref(query, p, activePublication));

    return (
        <div className="space-y-6">
            {publications.length > 1 && (
                <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter by publication">
                    <Link
                        href={issuesHref(query, 1, null)}
                        className={`inline-flex items-center gap-1.5 border px-3 py-1.5 text-xs transition-colors ${
                            !activePublication
                                ? "border-foreground bg-foreground text-background"
                                : "border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground"
                        }`}
                    >
                        All
                    </Link>
                    {publications.map((p) => {
                        const active = activePublication === p.slug;
                        return (
                            <Link
                                key={p.slug}
                                href={issuesHref(query, 1, p.slug)}
                                className={`inline-flex items-center gap-1.5 border px-3 py-1.5 text-xs transition-colors ${
                                    active
                                        ? "border-foreground bg-foreground text-background"
                                        : "border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground"
                                }`}
                                title={`${p.issueCount} issue${p.issueCount === 1 ? "" : "s"}`}
                            >
                                {p.name}
                                <span className={active ? "opacity-70" : "text-muted-foreground/70"}>
                                    {p.issueCount}
                                </span>
                            </Link>
                        );
                    })}
                </div>
            )}
            <form
                onSubmit={(e) => {
                    e.preventDefault();
                    submit(value);
                }}
                role="search"
                className="relative"
            >
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                    type="search"
                    name="q"
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    placeholder="Search issues…"
                    aria-label="Search issues"
                    className="pl-9 pr-9"
                />
                {value && (
                    <button
                        type="button"
                        onClick={() => {
                            setValue("");
                            submit("");
                        }}
                        aria-label="Clear search"
                        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground"
                    >
                        <X className="h-4 w-4" />
                    </button>
                )}
            </form>

            {query && (
                <p className="text-sm text-muted-foreground">
                    {total} result{total === 1 ? "" : "s"} for{" "}
                    <span className="font-medium text-foreground">“{query}”</span>.
                </p>
            )}

            {issues.length === 0 ? (
                query ? (
                    <p className="py-12 text-center text-sm text-muted-foreground">
                        No issues match{" "}
                        <span className="font-medium text-foreground">“{query}”</span>.
                    </p>
                ) : (
                    <p className="py-16 text-center text-sm text-muted-foreground">
                        No issues yet — check back soon.
                    </p>
                )
            ) : (
                <>
                    <ul className="space-y-3">
                        {issues.map((issue) => (
                            <li key={issue.id}>
                                <Link
                                    href={`/issues/${issue.slug}`}
                                    className="group flex items-start justify-between gap-4 border border-border p-4 transition-colors hover:border-foreground/30 hover:bg-muted/40"
                                >
                                    <div className="flex min-w-0 flex-col gap-1">
                                        <span className="truncate text-sm font-medium transition-colors group-hover:text-foreground">
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
                                        href={issuesHref(query, Math.max(1, safePage - 1), activePublication)}
                                        onClick={(e) => {
                                            e.preventDefault();
                                            goto(Math.max(1, safePage - 1));
                                        }}
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
                                                href={issuesHref(query, p as number, activePublication)}
                                                isActive={safePage === p}
                                                onClick={(e) => {
                                                    e.preventDefault();
                                                    goto(p as number);
                                                }}
                                            >
                                                {p}
                                            </PaginationLink>
                                        </PaginationItem>
                                    )
                                )}

                                <PaginationItem>
                                    <PaginationNext
                                        href={issuesHref(query, Math.min(totalPages, safePage + 1), activePublication)}
                                        onClick={(e) => {
                                            e.preventDefault();
                                            goto(Math.min(totalPages, safePage + 1));
                                        }}
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
