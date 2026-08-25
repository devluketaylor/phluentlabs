"use client"

import {trpc} from "@/trpc/client";
import {useEffect, useRef, useState} from "react";
import {Button} from "@/components/ui/button";
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from "@/components/ui/select";
import {Input} from "@/components/ui/input";
import {Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger} from "@/components/ui/dialog";
import {Card} from "@/components/ui/card";
import {toast} from "sonner";

type Status = "pending" | "subscribed" | "unsubscribed";

export const SubscribersTable = () => {
    const utils = trpc.useUtils();
    const [q, setQ] = useState("")
    const [status, setStatus] = useState<Status | "all">("all");
    const [page, setPage] = useState(0);
    const pageSize = 25;

    // Reset to first page whenever the filters change.
    useEffect(() => {
        setPage(0);
    }, [q, status]);

    const list = trpc.adminSubscribers.list.useQuery({
        q: q.trim() || undefined,
        status: status === "all" ? undefined : status,
        limit: pageSize,
        offset: page * pageSize,
    }, { placeholderData: (prev) => prev });

    const total = list.data?.total ?? 0;
    const rows = list.data?.rows ?? [];
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
            await utils.adminSubscribers.list.invalidate();
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

    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <div className="min-w-[720px]">
        <div className="grid grid-cols-12 gap-2 border-b bg-muted/30 px-3 py-2 text-xs font-medium text-muted-foreground">
            <div className="col-span-5">Email</div>
            <div className="col-span-2">First</div>
            <div className="col-span-2">Last</div>
            <div className="col-span-2">Status</div>
            <div className="col-span-1 text-right">Actions</div>
        </div>

        {rows.map((s) => (
            <div key={s.id} className="grid grid-cols-12 gap-2 px-3 py-2 items-center border-b">
                <div className="col-span-5 truncate text-sm">{s.email}</div>
                <div className="col-span-2 truncate text-sm text-muted-foreground">{s.firstName ?? "—"}</div>
                <div className="col-span-2 truncate text-sm text-muted-foreground">{s.lastName ?? "—"}</div>
                <div className="col-span-2 text-sm">{s.status}</div>
                <div className="col-span-1 flex justify-end gap-2">
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
            </div>
        ))}
        </div>
      </div>

        {!list.isLoading && rows.length === 0 && (
            <div className="p-10 text-center text-sm text-muted-foreground">No subscribers found.</div>
        )}

        {list.isLoading && (
            <div className="p-10 text-center text-sm text-muted-foreground">Loading…</div>
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

type ImportRow = { email: string; firstName: string | null; lastName: string | null; status?: Status };

// Minimal RFC-4180-ish CSV parser: handles quoted fields, embedded commas,
// escaped quotes (""), and \r\n / \n line endings.
function parseCsv(text: string): string[][] {
    const rows: string[][] = [];
    let field = "";
    let row: string[] = [];
    let inQuotes = false;
    const src = text.replace(/^\uFEFF/, ""); // strip BOM

    for (let i = 0; i < src.length; i++) {
        const ch = src[i];
        if (inQuotes) {
            if (ch === '"') {
                if (src[i + 1] === '"') {
                    field += '"';
                    i++;
                } else {
                    inQuotes = false;
                }
            } else {
                field += ch;
            }
        } else if (ch === '"') {
            inQuotes = true;
        } else if (ch === ",") {
            row.push(field);
            field = "";
        } else if (ch === "\n" || ch === "\r") {
            if (ch === "\r" && src[i + 1] === "\n") i++;
            row.push(field);
            field = "";
            rows.push(row);
            row = [];
        } else {
            field += ch;
        }
    }
    // trailing field/row
    if (field.length > 0 || row.length > 0) {
        row.push(field);
        rows.push(row);
    }
    return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

const VALID_STATUSES: Status[] = ["pending", "subscribed", "unsubscribed"];

function rowsToImport(parsed: string[][]): ImportRow[] {
    if (parsed.length === 0) return [];

    // Detect header row: if first row contains an "email" cell.
    const first = parsed[0].map((c) => c.trim().toLowerCase());
    const hasHeader = first.includes("email");

    let idxEmail = 0;
    let idxFirst = 1;
    let idxLast = 2;
    let idxStatus = 3;
    let dataRows = parsed;

    if (hasHeader) {
        const find = (names: string[]) => first.findIndex((c) => names.includes(c));
        idxEmail = find(["email", "e-mail", "email address"]);
        idxFirst = find(["first_name", "first name", "firstname", "first"]);
        idxLast = find(["last_name", "last name", "lastname", "last"]);
        idxStatus = find(["status"]);
        dataRows = parsed.slice(1);
    }

    const out: ImportRow[] = [];
    for (const r of dataRows) {
        const email = (idxEmail >= 0 ? r[idxEmail] : "")?.trim() ?? "";
        if (!email) continue;
        const firstName = idxFirst >= 0 ? (r[idxFirst]?.trim() || null) : null;
        const lastName = idxLast >= 0 ? (r[idxLast]?.trim() || null) : null;
        const rawStatus = idxStatus >= 0 ? (r[idxStatus]?.trim().toLowerCase() ?? "") : "";
        const status = VALID_STATUSES.includes(rawStatus as Status) ? (rawStatus as Status) : undefined;
        out.push({ email, firstName, lastName, status });
    }
    return out;
}

function ImportSubscribersButton({
    onImport,
    importing,
}: {
    onImport: (rows: ImportRow[]) => void;
    importing: boolean;
}) {
    const inputRef = useRef<HTMLInputElement>(null);

    const handleFile = async (file: File) => {
        try {
            const text = await file.text();
            const parsed = parseCsv(text);
            const rows = rowsToImport(parsed);
            if (rows.length === 0) {
                toast.error("No valid rows found in CSV");
                return;
            }
            onImport(rows);
        } catch (err: any) {
            toast.error(err?.message || "Failed to read CSV");
        }
    };

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
            <Button
                variant="secondary"
                onClick={() => inputRef.current?.click()}
                disabled={importing}
            >
                {importing ? "Importing…" : "Import CSV"}
            </Button>
        </>
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

                    <div className="grid grid-cols-2 gap-3">
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
    onSave: (input: { id: string; email: string; firstName: string | null; lastName: string | null; status: Status }) => void;
    saving: boolean;
}) {
    const [open, setOpen] = useState(false);

    const [email, setEmail] = useState(subscriber.email);
    const [firstName, setFirstName] = useState(subscriber.firstName ?? "");
    const [lastName, setLastName] = useState(subscriber.lastName ?? "");
    const [status, setStatus] = useState<Status>(subscriber.status);

    useEffect(() => {
        if (!open) return;
        setEmail(subscriber.email);
        setFirstName(subscriber.firstName ?? "");
        setLastName(subscriber.lastName ?? "");
        setStatus(subscriber.status);
    }, [open, subscriber]);

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

                    <div className="grid grid-cols-2 gap-3">
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
                                    id: subscriber.id,
                                    email,
                                    firstName: firstName.trim() ? firstName.trim() : null,
                                    lastName: lastName.trim() ? lastName.trim() : null,
                                    status,
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