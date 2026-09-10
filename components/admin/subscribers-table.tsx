"use client"

import {trpc} from "@/trpc/client";
import {useEffect, useRef, useState} from "react";
import {Button} from "@/components/ui/button";
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from "@/components/ui/select";
import {Input} from "@/components/ui/input";
import {Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger} from "@/components/ui/dialog";
import {Card} from "@/components/ui/card";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import {toast} from "sonner";
import {ArrowDown, ArrowUp, ChevronsUpDown} from "lucide-react";
import Link from "next/link";
import {
    IMPORT_SOURCES,
    parseCsv,
    rowsToImport,
    type ImportRow,
    type ImportSource,
} from "@/lib/import-subscribers";

type Status = "pending" | "subscribed" | "unsubscribed";
type SortBy = "email" | "firstName" | "lastName" | "status" | "createdAt";
type SortDir = "asc" | "desc";

export const SubscribersTable = () => {
    const utils = trpc.useUtils();
    const [q, setQ] = useState("")
    const [status, setStatus] = useState<Status | "all">("all");
    const [tag, setTag] = useState<string>("all");
    const [page, setPage] = useState(0);
    const pageSize = 25;
    const [sortBy, setSortBy] = useState<SortBy>("createdAt");
    const [sortDir, setSortDir] = useState<SortDir>("desc");

    // Reset to first page whenever the filters or sort change.
    useEffect(() => {
        setPage(0);
    }, [q, status, tag, sortBy, sortDir]);

    // Click a column header: toggle direction if already sorted by it,
    // otherwise sort by it (asc for text, desc for the date column).
    const toggleSort = (col: SortBy) => {
        if (sortBy === col) {
            setSortDir((d) => (d === "asc" ? "desc" : "asc"));
        } else {
            setSortBy(col);
            setSortDir(col === "createdAt" ? "desc" : "asc");
        }
    };

    const list = trpc.adminSubscribers.list.useQuery({
        q: q.trim() || undefined,
        status: status === "all" ? undefined : status,
        tag: tag === "all" ? undefined : tag,
        limit: pageSize,
        offset: page * pageSize,
        sortBy,
        sortDir,
    }, { placeholderData: (prev) => prev });

    const tagsQuery = trpc.adminSubscribers.listTags.useQuery();
    const availableTags = tagsQuery.data?.tags ?? [];
    // If the active tag filter no longer exists (last usage removed), reset it.
    useEffect(() => {
        if (tag !== "all" && tagsQuery.data && !availableTags.some((t) => t.tag === tag)) {
            setTag("all");
        }
    }, [tag, tagsQuery.data, availableTags]);

    const total = list.data?.total ?? 0;
    const rows = list.data?.rows ?? [];

    // Multi-select state (scoped to the currently-visible page).
    const [selected, setSelected] = useState<Set<string>>(new Set());
    // Drop selections for rows no longer present (page change, deletes, filters).
    useEffect(() => {
        setSelected((prev) => {
            if (prev.size === 0) return prev;
            const visible = new Set(rows.map((r) => r.id));
            const next = new Set([...prev].filter((id) => visible.has(id)));
            return next.size === prev.size ? prev : next;
        });
    }, [rows]);

    const selectedIds = [...selected];
    const allVisibleSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));
    const toggleRow = (id: string) =>
        setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    const toggleAllVisible = () =>
        setSelected((prev) => {
            const next = new Set(prev);
            if (allVisibleSelected) rows.forEach((r) => next.delete(r.id));
            else rows.forEach((r) => next.add(r.id));
            return next;
        });
    const clearSelection = () => setSelected(new Set());
    const pageCount = Math.max(1, Math.ceil(total / pageSize));
    const rangeStart = total === 0 ? 0 : page * pageSize + 1;
    const rangeEnd = Math.min(total, page * pageSize + rows.length);

    const create = trpc.adminSubscribers.create.useMutation({
        onSuccess: async () => {
            await utils.adminSubscribers.list.invalidate();
            toast.success("Subscriber added");
        },
        onError: (err) => toast.error(err.message || "Failed to add subscriber"),
    })

    const update = trpc.adminSubscribers.update.useMutation({
        onSuccess: async () => {
            await Promise.all([
                utils.adminSubscribers.list.invalidate(),
                utils.adminSubscribers.listTags.invalidate(),
            ]);
            toast.success("Subscriber updated");
        },
        onError: (err) => toast.error(err.message || "Failed to update subscriber"),
    })

    const del = trpc.adminSubscribers.delete.useMutation({
        onSuccess: async () => {
            await utils.adminSubscribers.list.invalidate();
            toast.success("Subscriber deleted");
        },
        onError: (err) => toast.error(err.message || "Failed to delete subscriber"),
    })

    const [exporting, setExporting] = useState(false);
    const handleExport = async () => {
        setExporting(true);
        try {
            const res = await utils.adminSubscribers.exportCsv.fetch({
                q: q.trim() || undefined,
                status: status === "all" ? undefined : status,
            });
            const blob = new Blob([res.csv], { type: "text/csv;charset=utf-8;" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            const stamp = new Date().toISOString().slice(0, 10);
            a.download = `subscribers-${stamp}.csv`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            toast.success(`Exported ${res.count} subscriber${res.count === 1 ? "" : "s"}`);
        } catch (err: any) {
            toast.error(err?.message || "Export failed");
        } finally {
            setExporting(false);
        }
    };

    const bulkImport = trpc.adminSubscribers.bulkImport.useMutation({
        onSuccess: async (res) => {
            await utils.adminSubscribers.list.invalidate();
            toast.success(
                `Imported ${res.inserted} · ${res.skippedDuplicate} duplicate${res.skippedDuplicate === 1 ? "" : "s"} skipped · ${res.skippedInvalid} invalid`
            );
        },
        onError: (err) => toast.error(err.message || "Import failed"),
    });

    const bulkUpdateStatus = trpc.adminSubscribers.bulkUpdateStatus.useMutation({
        onSuccess: async (res) => {
            await utils.adminSubscribers.list.invalidate();
            clearSelection();
            toast.success(`Updated ${res.updated} subscriber${res.updated === 1 ? "" : "s"}`);
        },
        onError: (err) => toast.error(err.message || "Bulk update failed"),
    });

    const bulkDelete = trpc.adminSubscribers.bulkDelete.useMutation({
        onSuccess: async (res) => {
            await utils.adminSubscribers.list.invalidate();
            clearSelection();
            toast.success(`Deleted ${res.deleted} subscriber${res.deleted === 1 ? "" : "s"}`);
        },
        onError: (err) => toast.error(err.message || "Bulk delete failed"),
    });

    const [bulkExporting, setBulkExporting] = useState(false);
    const handleExportSelected = async () => {
        if (selectedIds.length === 0) return;
        setBulkExporting(true);
        try {
            const res = await utils.adminSubscribers.exportCsv.fetch({ ids: selectedIds });
            const blob = new Blob([res.csv], { type: "text/csv;charset=utf-8;" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            const stamp = new Date().toISOString().slice(0, 10);
            a.download = `subscribers-selected-${stamp}.csv`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            toast.success(`Exported ${res.count} subscriber${res.count === 1 ? "" : "s"}`);
        } catch (err: any) {
            toast.error(err?.message || "Export failed");
        } finally {
            setBulkExporting(false);
        }
    };

    const bulkBusy = bulkUpdateStatus.isPending || bulkDelete.isPending || bulkExporting;

        return (
        <div className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Input
    value={q}
    onChange={(e) => setQ(e.target.value)}
    placeholder="Search email / name…"
    className="sm:w-[280px]"
        />

        <Select value={status} onValueChange={(v) => setStatus(v as any)}>
<SelectTrigger className="sm:w-[200px]">
        <SelectValue placeholder="Filter status" />
        </SelectTrigger>
    <SelectContent>
        <SelectItem value="all">All</SelectItem>
        <SelectItem value="pending">Pending</SelectItem>
        <SelectItem value="subscribed">Subscribed</SelectItem>
        <SelectItem value="unsubscribed">Unsubscribed</SelectItem>
    </SelectContent>
</Select>

        <Select value={tag} onValueChange={(v) => setTag(v)}>
<SelectTrigger className="sm:w-[200px]">
        <SelectValue placeholder="Filter tag" />
        </SelectTrigger>
    <SelectContent>
        <SelectItem value="all">All tags</SelectItem>
        {availableTags.map((t) => (
            <SelectItem key={t.tag} value={t.tag}>
                {t.tag} ({t.count})
            </SelectItem>
        ))}
    </SelectContent>
</Select>
</div>

    <div className="flex flex-wrap items-center gap-2">
        <AddSubscriberDialog
            onSave={(next) => create.mutate(next)}
            saving={create.isPending}
        />
        <ImportSubscribersButton
            onImport={(rows) => bulkImport.mutate({ rows })}
            importing={bulkImport.isPending}
        />
        <Button variant="secondary" onClick={handleExport} disabled={exporting}>
            {exporting ? "Exporting…" : "Export CSV"}
        </Button>
        <Button variant="secondary" onClick={() => list.refetch()} disabled={list.isFetching}>
            {list.isFetching ? "Refreshing…" : "Refresh"}
        </Button>
    </div>
</div>

    {selectedIds.length > 0 && (
        <div className="flex flex-col gap-3 rounded-md border bg-muted/40 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm font-medium">
                {selectedIds.length} selected
            </div>
            <div className="flex flex-wrap items-center gap-2">
                <Select
                    value=""
                    onValueChange={(v) =>
                        bulkUpdateStatus.mutate({ ids: selectedIds, status: v as Status })
                    }
                >
                    <SelectTrigger className="w-[190px]" disabled={bulkBusy}>
                        <SelectValue placeholder="Set status…" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="pending">Set: Pending</SelectItem>
                        <SelectItem value="subscribed">Set: Subscribed</SelectItem>
                        <SelectItem value="unsubscribed">Set: Unsubscribed</SelectItem>
                    </SelectContent>
                </Select>
                <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleExportSelected}
                    disabled={bulkBusy}
                >
                    {bulkExporting ? "Exporting…" : "Export selected"}
                </Button>
                <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => bulkDelete.mutate({ ids: selectedIds })}
                    disabled={bulkBusy}
                >
                    {bulkDelete.isPending ? "Deleting…" : "Delete selected"}
                </Button>
                <Button variant="secondary" size="sm" onClick={clearSelection} disabled={bulkBusy}>
                    Clear
                </Button>
            </div>
        </div>
    )}

    <Card className="overflow-hidden">
      <div className="max-h-[70vh] overflow-auto">
        <div className="min-w-[720px]">
        <Table>
            <TableHeader stickyHeader>
                <TableRow className="hover:bg-transparent">
                    <TableHead className="w-[44px]">
                        <input
                            type="checkbox"
                            aria-label="Select all on this page"
                            className="h-4 w-4 cursor-pointer accent-[#ff5c5c]"
                            checked={allVisibleSelected}
                            onChange={toggleAllVisible}
                            disabled={rows.length === 0}
                        />
                    </TableHead>
                    <SortableHead label="Email" col="email" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort} />
                    <SortableHead label="First" col="firstName" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort} />
                    <SortableHead label="Last" col="lastName" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort} />
                    <SortableHead label="Status" col="status" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort} />
                    <TableHead>Tags</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {rows.map((s) => (
                    <TableRow key={s.id} data-state={selected.has(s.id) ? "selected" : undefined}>
                        <TableCell className="w-[44px]">
                            <input
                                type="checkbox"
                                aria-label={`Select ${s.email}`}
                                className="h-4 w-4 cursor-pointer accent-[#ff5c5c]"
                                checked={selected.has(s.id)}
                                onChange={() => toggleRow(s.id)}
                            />
                        </TableCell>
                        <TableCell className="max-w-[240px] truncate">{s.email}</TableCell>
                        <TableCell className="max-w-[160px] truncate text-muted-foreground">{s.firstName ?? "—"}</TableCell>
                        <TableCell className="max-w-[160px] truncate text-muted-foreground">{s.lastName ?? "—"}</TableCell>
                        <TableCell>{s.status}</TableCell>
                        <TableCell className="max-w-[220px]">
                            {s.tags && s.tags.length > 0 ? (
                                <div className="flex flex-wrap gap-1">
                                    {s.tags.map((t: string) => (
                                        <span
                                            key={t}
                                            className="inline-flex items-center rounded-full border border-[#ff5c5c]/40 bg-[#ff5c5c]/10 px-2 py-0.5 text-xs font-medium text-[#ff5c5c]"
                                        >
                                            {t}
                                        </span>
                                    ))}
                                </div>
                            ) : (
                                <span className="text-muted-foreground">—</span>
                            )}
                        </TableCell>
                        <TableCell>
                            <div className="flex justify-end gap-2">
                                <Button asChild size="sm" variant="secondary">
                                    <Link href={`/admin/subscribers/${s.id}`}>View</Link>
                                </Button>
                                <EditSubscriberDialog
                                    subscriber={s}
                                    onSave={(next) => update.mutate(next)}
                                    saving={update.isPending}
                                />
                                <Button
                                    variant="destructive"
                                    size="sm"
                                    onClick={() => del.mutate({ id: s.id })}
                                    disabled={del.isPending}
                                >
                                    Delete
                                </Button>
                            </div>
                        </TableCell>
                    </TableRow>
                ))}
            </TableBody>
        </Table>
        </div>
      </div>

        {!list.isLoading && rows.length === 0 && !list.error && (
            <div className="flex flex-col items-center gap-1 p-12 text-center">
                <div className="text-sm font-medium">No subscribers found</div>
                <div className="text-sm text-muted-foreground">
                    {q.trim() || status !== "all"
                        ? "Try clearing your search or status filter."
                        : "Add your first subscriber or import a CSV to get started."}
                </div>
            </div>
        )}

        {list.isLoading && (
            <div className="space-y-2 p-3">
                {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-3">
                        <div className="h-4 w-4 rounded bg-muted animate-pulse" />
                        <div className="h-4 flex-1 rounded bg-muted animate-pulse" />
                        <div className="h-4 w-24 rounded bg-muted animate-pulse" />
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
                ? "No subscribers"
                : `Showing ${rangeStart}–${rangeEnd} of ${total} subscriber${total === 1 ? "" : "s"}`}
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
        )
}

function SortableHead({
    label,
    col,
    sortBy,
    sortDir,
    onSort,
}: {
    label: string;
    col: SortBy;
    sortBy: SortBy;
    sortDir: SortDir;
    onSort: (col: SortBy) => void;
}) {
    const active = sortBy === col;
    return (
        <TableHead className="p-0">
            <button
                type="button"
                onClick={() => onSort(col)}
                aria-sort={active ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
                className="flex h-10 w-full items-center gap-1 px-3 text-left font-medium transition-colors hover:text-foreground"
            >
                <span>{label}</span>
                {active ? (
                    sortDir === "asc" ? (
                        <ArrowUp className="h-3.5 w-3.5 text-[#ff5c5c]" />
                    ) : (
                        <ArrowDown className="h-3.5 w-3.5 text-[#ff5c5c]" />
                    )
                ) : (
                    <ChevronsUpDown className="h-3.5 w-3.5 opacity-40" />
                )}
            </button>
        </TableHead>
    );
}

// ImportRow / parseCsv / rowsToImport now live in @/lib/import-subscribers so
// the format-detection + column-mapping logic is shared and testable.

function ImportSubscribersButton({
    onImport,
    importing,
}: {
    onImport: (rows: ImportRow[]) => void;
    importing: boolean;
}) {
    const inputRef = useRef<HTMLInputElement>(null);
    const [source, setSource] = useState<ImportSource>("auto");
    const [open, setOpen] = useState(false);
    const [fileName, setFileName] = useState<string>("");
    const [rows, setRows] = useState<ImportRow[]>([]);
    const [detected, setDetected] = useState<string>("");

    const preview = trpc.adminSubscribers.previewImport.useQuery(
        { emails: rows.map((r) => r.email) },
        { enabled: open && rows.length > 0 }
    );

    const handleFile = async (file: File) => {
        try {
            const text = await file.text();
            const parsed = parseCsv(text);
            const { rows: mapped, detected: det } = rowsToImport(parsed, source);
            if (mapped.length === 0) {
                toast.error("No rows with an email found in that file");
                return;
            }
            setRows(mapped);
            setDetected(det);
            setFileName(file.name);
            setOpen(true);
        } catch (err: any) {
            toast.error(err?.message || "Failed to read file");
        }
    };

    const reset = () => {
        setOpen(false);
        setRows([]);
        setFileName("");
        setDetected("");
    };

    const sourceLabel = (v: string) =>
        IMPORT_SOURCES.find((s) => s.value === v)?.label ?? v;

    return (
        <>
            <input
                ref={inputRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void handleFile(file);
                    e.target.value = "";
                }}
            />
            <div className="flex items-center gap-2">
                <Select value={source} onValueChange={(v) => setSource(v as ImportSource)}>
                    <SelectTrigger className="w-[160px]" aria-label="Import source">
                        <SelectValue placeholder="Import source" />
                    </SelectTrigger>
                    <SelectContent>
                        {IMPORT_SOURCES.map((s) => (
                            <SelectItem key={s.value} value={s.value}>
                                {s.label}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <Button
                    variant="secondary"
                    onClick={() => inputRef.current?.click()}
                    disabled={importing}
                >
                    {importing ? "Importing…" : "Import"}
                </Button>
            </div>

            <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : reset())}>
                <DialogContent className="sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle>Import preview</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 text-sm">
                        <div className="text-muted-foreground">
                            <span className="font-medium text-foreground">{fileName}</span> ·{" "}
                            {rows.length} row{rows.length === 1 ? "" : "s"} parsed
                            {source === "auto" && detected ? (
                                <> · detected format: <span className="font-medium text-foreground">{sourceLabel(detected)}</span></>
                            ) : null}
                        </div>

                        {preview.isLoading ? (
                            <div className="text-muted-foreground">Analyzing…</div>
                        ) : preview.data ? (
                            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                                <PreviewStat label="To add" value={preview.data.add} accent />
                                <PreviewStat label="Conflicts" value={preview.data.conflict} />
                                <PreviewStat label="In-file dupes" value={preview.data.duplicateInFile} />
                                <PreviewStat label="Invalid" value={preview.data.invalid} />
                            </div>
                        ) : preview.error ? (
                            <div className="text-destructive">{preview.error.message}</div>
                        ) : null}

                        {preview.data && preview.data.conflictSample.length > 0 ? (
                            <div className="rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
                                <div className="mb-1 font-medium text-foreground">
                                    Already-subscribed (will be skipped):
                                </div>
                                <div className="break-all">
                                    {preview.data.conflictSample.join(", ")}
                                    {preview.data.conflict > preview.data.conflictSample.length
                                        ? ` … +${preview.data.conflict - preview.data.conflictSample.length} more`
                                        : ""}
                                </div>
                            </div>
                        ) : null}

                        <div className="flex justify-end gap-2 pt-2">
                            <Button variant="secondary" onClick={reset} disabled={importing}>
                                Cancel
                            </Button>
                            <Button
                                onClick={() => {
                                    onImport(rows);
                                    reset();
                                }}
                                disabled={importing || !preview.data || preview.data.add === 0}
                                style={{ backgroundColor: "#ff5c5c" }}
                                className="text-white hover:opacity-90"
                            >
                                {importing
                                    ? "Importing…"
                                    : preview.data
                                        ? `Import ${preview.data.add}`
                                        : "Import"}
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
}

function PreviewStat({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
    return (
        <div className="rounded-md border border-border p-3 text-center">
            <div className={`text-xl font-semibold ${accent ? "" : "text-foreground"}`} style={accent ? { color: "#ff5c5c" } : undefined}>
                {value}
            </div>
            <div className="mt-0.5 text-xs text-muted-foreground">{label}</div>
        </div>
    );
}

function AddSubscriberDialog({
                                 onSave,
                                 saving,
                             }: {
    onSave: (input: { email: string; firstName: string | null; lastName: string | null; status: Status }) => void;
    saving: boolean;
}) {
    const [open, setOpen] = useState(false);

    const [email, setEmail] = useState("");
    const [firstName, setFirstName] = useState("");
    const [lastName, setLastName] = useState("");
    const [status, setStatus] = useState<Status>("subscribed");

    useEffect(() => {
        if (open) return;
        setEmail("");
        setFirstName("");
        setLastName("");
        setStatus("subscribed");
    }, [open]);

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button size="sm">Add subscriber</Button>
            </DialogTrigger>

            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>Add subscriber</DialogTitle>
                </DialogHeader>

                <div className="space-y-3">
                    <div className="space-y-2">
                        <div className="text-sm font-medium">Email</div>
                        <Input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="name@example.com"
                        />
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-2">
                            <div className="text-sm font-medium">First name</div>
                            <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} />
                        </div>
                        <div className="space-y-2">
                            <div className="text-sm font-medium">Last name</div>
                            <Input value={lastName} onChange={(e) => setLastName(e.target.value)} />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <div className="text-sm font-medium">Status</div>
                        <Select value={status} onValueChange={(v) => setStatus(v as Status)}>
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="pending">Pending</SelectItem>
                                <SelectItem value="subscribed">Subscribed</SelectItem>
                                <SelectItem value="unsubscribed">Unsubscribed</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="flex justify-end gap-2 pt-2">
                        <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
                        <Button
                            onClick={() => {
                                onSave({
                                    email: email.trim(),
                                    firstName: firstName.trim() ? firstName.trim() : null,
                                    lastName: lastName.trim() ? lastName.trim() : null,
                                    status,
                                });
                                setOpen(false);
                            }}
                            disabled={saving || !email.trim()}
                        >
                            Add
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}

function EditSubscriberDialog({
                                  subscriber,
                                  onSave,
                                  saving,
                              }: {
    subscriber: any;
    onSave: (input: { id: string; email: string; firstName: string | null; lastName: string | null; status: Status; tags: string[] }) => void;
    saving: boolean;
}) {
    const [open, setOpen] = useState(false);

    const [email, setEmail] = useState(subscriber.email);
    const [firstName, setFirstName] = useState(subscriber.firstName ?? "");
    const [lastName, setLastName] = useState(subscriber.lastName ?? "");
    const [status, setStatus] = useState<Status>(subscriber.status);
    const [tags, setTags] = useState<string[]>(subscriber.tags ?? []);
    const [tagInput, setTagInput] = useState("");

    useEffect(() => {
        if (!open) return;
        setEmail(subscriber.email);
        setFirstName(subscriber.firstName ?? "");
        setLastName(subscriber.lastName ?? "");
        setStatus(subscriber.status);
        setTags(subscriber.tags ?? []);
        setTagInput("");
    }, [open, subscriber]);

    const addTag = (raw: string) => {
        const t = raw.trim();
        if (!t) return;
        setTags((prev) =>
            prev.some((x) => x.toLowerCase() === t.toLowerCase()) ? prev : [...prev, t]
        );
        setTagInput("");
    };
    const removeTag = (t: string) => setTags((prev) => prev.filter((x) => x !== t));

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button size="sm" variant="secondary">Edit</Button>
            </DialogTrigger>

            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>Edit subscriber</DialogTitle>
                </DialogHeader>

                <div className="space-y-3">
                    <div className="space-y-2">
                        <div className="text-sm font-medium">Email</div>
                        <Input value={email} onChange={(e) => setEmail(e.target.value)} />
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-2">
                            <div className="text-sm font-medium">First name</div>
                            <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} />
                        </div>
                        <div className="space-y-2">
                            <div className="text-sm font-medium">Last name</div>
                            <Input value={lastName} onChange={(e) => setLastName(e.target.value)} />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <div className="text-sm font-medium">Status</div>
                        <Select value={status} onValueChange={(v) => setStatus(v as Status)}>
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="pending">Pending</SelectItem>
                                <SelectItem value="subscribed">Subscribed</SelectItem>
                                <SelectItem value="unsubscribed">Unsubscribed</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-2">
                        <div className="text-sm font-medium">Tags</div>
                        {tags.length > 0 && (
                            <div className="flex flex-wrap gap-1.5">
                                {tags.map((t) => (
                                    <span
                                        key={t}
                                        className="inline-flex items-center gap-1 rounded-full border border-[#ff5c5c]/40 bg-[#ff5c5c]/10 px-2 py-0.5 text-xs font-medium text-[#ff5c5c]"
                                    >
                                        {t}
                                        <button
                                            type="button"
                                            aria-label={`Remove tag ${t}`}
                                            onClick={() => removeTag(t)}
                                            className="ml-0.5 rounded-full leading-none hover:opacity-70"
                                        >
                                            ×
                                        </button>
                                    </span>
                                ))}
                            </div>
                        )}
                        <div className="flex gap-2">
                            <Input
                                value={tagInput}
                                onChange={(e) => setTagInput(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter" || e.key === ",") {
                                        e.preventDefault();
                                        addTag(tagInput);
                                    }
                                }}
                                placeholder="Add a tag and press Enter"
                            />
                            <Button
                                type="button"
                                variant="secondary"
                                onClick={() => addTag(tagInput)}
                                disabled={!tagInput.trim()}
                            >
                                Add
                            </Button>
                        </div>
                    </div>

                    <div className="flex justify-end gap-2 pt-2">
                        <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
                        <Button
                            onClick={() => {
                                onSave({
                                    id: subscriber.id,
                                    email,
                                    firstName: firstName.trim() ? firstName.trim() : null,
                                    lastName: lastName.trim() ? lastName.trim() : null,
                                    status,
                                    tags,
                                });
                                setOpen(false);
                            }}
                            disabled={saving || !email.trim()}
                        >
                            Save
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}