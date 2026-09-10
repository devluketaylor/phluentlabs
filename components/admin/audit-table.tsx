"use client";

import { trpc } from "@/trpc/client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";

// Human-friendly labels for the dotted action strings recorded by recordAudit.
const ACTION_LABELS: Record<string, string> = {
    "subscriber.create": "Subscriber created",
    "subscriber.update": "Subscriber updated",
    "subscriber.delete": "Subscriber deleted",
    "subscriber.setTags": "Subscriber tags changed",
    "subscriber.bulkImport": "Subscribers imported",
    "subscriber.bulkUpdateStatus": "Subscribers status (bulk)",
    "subscriber.bulkDelete": "Subscribers deleted (bulk)",
    "newsletter.create": "Newsletter created",
    "newsletter.update": "Newsletter updated",
    "newsletter.delete": "Newsletter deleted",
    "newsletter.send": "Newsletter sent",
    "newsletter.schedule": "Newsletter scheduled",
    "newsletter.unschedule": "Newsletter unscheduled",
};

function actionLabel(action: string) {
    return ACTION_LABELS[action] ?? action;
}

function formatWhen(value: unknown) {
    const d = value instanceof Date ? value : new Date(String(value));
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleString();
}

export const AuditTable = () => {
    const [action, setAction] = useState<string>("all");
    const [actorId, setActorId] = useState<string>("all");
    const [page, setPage] = useState(0);
    const pageSize = 25;

    // Reset to first page whenever a filter changes.
    useEffect(() => {
        setPage(0);
    }, [action, actorId]);

    const list = trpc.adminAudit.list.useQuery(
        {
            action: action === "all" ? undefined : action,
            actorId: actorId === "all" ? undefined : actorId,
            limit: pageSize,
            offset: page * pageSize,
        },
        { placeholderData: (prev) => prev }
    );

    const actionsQuery = trpc.adminAudit.actions.useQuery();
    const actorsQuery = trpc.adminAudit.actors.useQuery();
    const availableActions = actionsQuery.data?.actions ?? [];
    const availableActors = actorsQuery.data?.actors ?? [];

    const total = list.data?.total ?? 0;
    const rows = list.data?.rows ?? [];
    const pageCount = Math.max(1, Math.ceil(total / pageSize));
    const rangeStart = total === 0 ? 0 : page * pageSize + 1;
    const rangeEnd = Math.min(total, page * pageSize + rows.length);

    return (
        <div className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <Select value={action} onValueChange={(v) => setAction(v)}>
                        <SelectTrigger className="sm:w-[240px]">
                            <SelectValue placeholder="Filter action" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All actions</SelectItem>
                            {availableActions.map((a) => (
                                <SelectItem key={a.action} value={a.action}>
                                    {actionLabel(a.action)} ({a.count})
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>

                    <Select value={actorId} onValueChange={(v) => setActorId(v)}>
                        <SelectTrigger className="sm:w-[240px]">
                            <SelectValue placeholder="Filter actor" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All actors</SelectItem>
                            {availableActors.map((a) => (
                                <SelectItem key={a.actorId} value={a.actorId}>
                                    {a.actorEmail ?? a.actorId} ({a.count})
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    <Button
                        variant="secondary"
                        onClick={() => list.refetch()}
                        disabled={list.isFetching}
                    >
                        {list.isFetching ? "Refreshing…" : "Refresh"}
                    </Button>
                </div>
            </div>

            <Card className="overflow-hidden">
                <div className="max-h-[70vh] overflow-auto">
                    <div className="min-w-[720px]">
                        <Table>
                            <TableHeader stickyHeader>
                                <TableRow className="hover:bg-transparent">
                                    <TableHead className="w-[190px]">When</TableHead>
                                    <TableHead>Action</TableHead>
                                    <TableHead>Actor</TableHead>
                                    <TableHead>Target</TableHead>
                                    <TableHead>Details</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {rows.map((r) => (
                                    <TableRow key={r.id}>
                                        <TableCell className="whitespace-nowrap text-muted-foreground">
                                            {formatWhen(r.createdAt)}
                                        </TableCell>
                                        <TableCell>
                                            <span className="inline-flex items-center rounded-full border border-[#ff5c5c]/40 bg-[#ff5c5c]/10 px-2 py-0.5 text-xs font-medium text-[#ff5c5c]">
                                                {actionLabel(r.action)}
                                            </span>
                                        </TableCell>
                                        <TableCell className="max-w-[220px] truncate">
                                            {r.actorEmail ?? r.actorId ?? "—"}
                                        </TableCell>
                                        <TableCell className="max-w-[220px] truncate text-muted-foreground">
                                            {r.targetType
                                                ? `${r.targetType}${r.targetId ? `:${r.targetId.slice(0, 8)}` : ""}`
                                                : "—"}
                                        </TableCell>
                                        <TableCell className="max-w-[320px]">
                                            {r.metadata ? (
                                                <code className="block max-w-full truncate rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                                                    {JSON.stringify(r.metadata)}
                                                </code>
                                            ) : (
                                                <span className="text-muted-foreground">—</span>
                                            )}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                </div>

                {!list.isLoading && rows.length === 0 && !list.error && (
                    <div className="flex flex-col items-center gap-1 p-12 text-center">
                        <div className="text-sm font-medium">No audit entries</div>
                        <div className="text-sm text-muted-foreground">
                            {action !== "all" || actorId !== "all"
                                ? "Try clearing the action or actor filter."
                                : "Admin actions will appear here as they happen."}
                        </div>
                    </div>
                )}

                {list.isLoading && (
                    <div className="space-y-2 p-3">
                        {Array.from({ length: 6 }).map((_, i) => (
                            <div key={i} className="flex items-center gap-3">
                                <div className="h-4 w-32 rounded bg-muted animate-pulse" />
                                <div className="h-4 flex-1 rounded bg-muted animate-pulse" />
                                <div className="h-4 w-24 rounded bg-muted animate-pulse" />
                            </div>
                        ))}
                    </div>
                )}

                {list.error && (
                    <div className="p-4 text-sm text-destructive">{list.error.message}</div>
                )}
            </Card>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-sm text-muted-foreground">
                    {total === 0
                        ? "No entries"
                        : `Showing ${rangeStart}–${rangeEnd} of ${total} entr${total === 1 ? "y" : "ies"}`}
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
        </div>
    );
};
