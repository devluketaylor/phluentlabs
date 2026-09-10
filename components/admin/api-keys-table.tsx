"use client";

import { trpc } from "@/trpc/client";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Copy, KeyRound, Plus } from "lucide-react";

function formatWhen(value: unknown) {
    if (!value) return "—";
    const d = value instanceof Date ? value : new Date(String(value));
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleString();
}

export const ApiKeysTable = () => {
    const utils = trpc.useUtils();
    const list = trpc.adminApiKeys.list.useQuery();
    const rows = list.data?.rows ?? [];

    const [createOpen, setCreateOpen] = useState(false);
    const [label, setLabel] = useState("");
    // The raw key is shown exactly once, right after creation.
    const [newKey, setNewKey] = useState<string | null>(null);

    const create = trpc.adminApiKeys.create.useMutation({
        onSuccess: (data) => {
            setNewKey(data.key);
            setLabel("");
            void utils.adminApiKeys.list.invalidate();
        },
        onError: (e) => toast.error(e.message),
    });

    const revoke = trpc.adminApiKeys.revoke.useMutation({
        onSuccess: () => {
            toast.success("API key revoked");
            void utils.adminApiKeys.list.invalidate();
        },
        onError: (e) => toast.error(e.message),
    });

    const copy = async (text: string) => {
        try {
            await navigator.clipboard.writeText(text);
            toast.success("Copied to clipboard");
        } catch {
            toast.error("Couldn't copy — copy it manually");
        }
    };

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-end">
                <Button
                    onClick={() => {
                        setNewKey(null);
                        setLabel("");
                        setCreateOpen(true);
                    }}
                >
                    <Plus className="size-4" />
                    New API key
                </Button>
            </div>

            <Card className="overflow-hidden">
                <div className="max-h-[70vh] overflow-auto">
                    <div className="min-w-[640px]">
                        <Table>
                            <TableHeader stickyHeader>
                                <TableRow className="hover:bg-transparent">
                                    <TableHead>Label</TableHead>
                                    <TableHead>Key</TableHead>
                                    <TableHead className="w-[190px]">Created</TableHead>
                                    <TableHead className="w-[190px]">Last used</TableHead>
                                    <TableHead className="w-[120px]">Status</TableHead>
                                    <TableHead className="w-[110px] text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {rows.map((r) => (
                                    <TableRow key={r.id}>
                                        <TableCell className="font-medium">{r.label}</TableCell>
                                        <TableCell>
                                            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                                                {r.prefix}…
                                            </code>
                                        </TableCell>
                                        <TableCell className="whitespace-nowrap text-muted-foreground">
                                            {formatWhen(r.createdAt)}
                                        </TableCell>
                                        <TableCell className="whitespace-nowrap text-muted-foreground">
                                            {formatWhen(r.lastUsedAt)}
                                        </TableCell>
                                        <TableCell>
                                            {r.revokedAt ? (
                                                <span className="inline-flex items-center rounded-full border border-muted-foreground/30 bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                                                    Revoked
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center rounded-full border border-[#ff5c5c]/40 bg-[#ff5c5c]/10 px-2 py-0.5 text-xs font-medium text-[#ff5c5c]">
                                                    Active
                                                </span>
                                            )}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            {!r.revokedAt && (
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="text-destructive hover:text-destructive"
                                                    onClick={() => revoke.mutate({ id: r.id })}
                                                    disabled={revoke.isPending}
                                                >
                                                    Revoke
                                                </Button>
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
                        <KeyRound className="size-6 text-muted-foreground" />
                        <div className="text-sm font-medium">No API keys yet</div>
                        <div className="text-sm text-muted-foreground">
                            Create a key to let external tools subscribe people via the API.
                        </div>
                    </div>
                )}

                {list.isLoading && (
                    <div className="space-y-2 p-3">
                        {Array.from({ length: 4 }).map((_, i) => (
                            <div key={i} className="flex items-center gap-3">
                                <div className="h-4 w-40 rounded bg-muted animate-pulse" />
                                <div className="h-4 flex-1 rounded bg-muted animate-pulse" />
                            </div>
                        ))}
                    </div>
                )}

                {list.error && (
                    <div className="p-4 text-sm text-destructive">{list.error.message}</div>
                )}
            </Card>

            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{newKey ? "Copy your API key" : "Create API key"}</DialogTitle>
                        <DialogDescription>
                            {newKey
                                ? "This is the only time the key will be shown. Copy it now and store it securely."
                                : "Give the key a label so you remember what it's for. It authenticates POST /api/v1/subscribe."}
                        </DialogDescription>
                    </DialogHeader>

                    {newKey ? (
                        <div className="space-y-3">
                            <div className="flex items-center gap-2">
                                <code className="flex-1 overflow-x-auto rounded bg-muted px-2 py-2 font-mono text-xs">
                                    {newKey}
                                </code>
                                <Button variant="secondary" size="sm" onClick={() => copy(newKey)}>
                                    <Copy className="size-4" />
                                </Button>
                            </div>
                            <p className="text-xs text-muted-foreground">
                                Use it as{" "}
                                <code className="rounded bg-muted px-1 py-0.5 font-mono">
                                    Authorization: Bearer &lt;key&gt;
                                </code>
                                .
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            <Label htmlFor="api-key-label">Label</Label>
                            <Input
                                id="api-key-label"
                                value={label}
                                onChange={(e) => setLabel(e.target.value)}
                                placeholder="e.g. Marketing site widget"
                                maxLength={120}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter" && label.trim()) create.mutate({ label: label.trim() });
                                }}
                            />
                        </div>
                    )}

                    <DialogFooter>
                        {newKey ? (
                            <Button onClick={() => setCreateOpen(false)}>Done</Button>
                        ) : (
                            <>
                                <Button variant="secondary" onClick={() => setCreateOpen(false)}>
                                    Cancel
                                </Button>
                                <Button
                                    onClick={() => create.mutate({ label: label.trim() })}
                                    disabled={!label.trim() || create.isPending}
                                >
                                    {create.isPending ? "Creating…" : "Create key"}
                                </Button>
                            </>
                        )}
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
};
