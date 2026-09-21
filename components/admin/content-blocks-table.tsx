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
import { NewsletterRichEditor } from "@/components/admin/newsletter-rich-editor";
import { Blocks, Plus } from "lucide-react";

type ContentBlock = {
    id: string;
    name: string;
    description: string | null;
    html: string;
    createdAt: string | Date;
    updatedAt: string | Date;
};

const emptyForm = { name: "", description: "", html: "" };

export const ContentBlocksTable = () => {
    const utils = trpc.useUtils();
    const list = trpc.adminContentBlocks.list.useQuery();
    const rows = (list.data?.rows ?? []) as ContentBlock[];

    // Shared create/edit dialog. `editing` null == create mode.
    const [open, setOpen] = useState(false);
    const [editing, setEditing] = useState<ContentBlock | null>(null);
    const [form, setForm] = useState(emptyForm);

    const invalidate = () => void utils.adminContentBlocks.list.invalidate();

    const create = trpc.adminContentBlocks.create.useMutation({
        onSuccess: () => {
            toast.success("Snippet saved");
            close();
            invalidate();
        },
        onError: (e) => toast.error(e.message),
    });

    const update = trpc.adminContentBlocks.update.useMutation({
        onSuccess: () => {
            toast.success("Snippet updated");
            close();
            invalidate();
        },
        onError: (e) => toast.error(e.message),
    });

    const remove = trpc.adminContentBlocks.remove.useMutation({
        onSuccess: () => {
            toast.success("Snippet deleted");
            invalidate();
        },
        onError: (e) => toast.error(e.message),
    });

    const openCreate = () => {
        setEditing(null);
        setForm(emptyForm);
        setOpen(true);
    };

    const openEdit = (b: ContentBlock) => {
        setEditing(b);
        setForm({ name: b.name, description: b.description ?? "", html: b.html });
        setOpen(true);
    };

    const close = () => {
        setOpen(false);
        setEditing(null);
        setForm(emptyForm);
    };

    const save = () => {
        const name = form.name.trim();
        const html = form.html.trim();
        if (!name || !html) return;
        const payload = {
            name,
            description: form.description.trim() || undefined,
            html,
        };
        if (editing) {
            update.mutate({ id: editing.id, ...payload });
        } else {
            create.mutate(payload);
        }
    };

    const saving = create.isPending || update.isPending;

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-end">
                <Button onClick={openCreate}>
                    <Plus className="size-4" />
                    New snippet
                </Button>
            </div>

            <Card className="overflow-hidden">
                <div className="max-h-[70vh] overflow-auto">
                    <div className="min-w-[560px]">
                        <Table>
                            <TableHeader stickyHeader>
                                <TableRow className="hover:bg-transparent">
                                    <TableHead>Name</TableHead>
                                    <TableHead>Preview</TableHead>
                                    <TableHead className="w-[160px] text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {rows.map((b) => (
                                    <TableRow key={b.id}>
                                        <TableCell className="font-medium align-top">
                                            {b.name}
                                            {b.description && (
                                                <div className="text-xs text-muted-foreground">
                                                    {b.description}
                                                </div>
                                            )}
                                        </TableCell>
                                        <TableCell className="align-top">
                                            <span className="line-clamp-2 text-xs text-muted-foreground">
                                                {b.html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() ||
                                                    "—"}
                                            </span>
                                        </TableCell>
                                        <TableCell className="text-right align-top space-x-1">
                                            <Button variant="ghost" size="sm" onClick={() => openEdit(b)}>
                                                Edit
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="text-destructive hover:text-destructive"
                                                onClick={() => {
                                                    if (confirm(`Delete the snippet "${b.name}"?`))
                                                        remove.mutate({ id: b.id });
                                                }}
                                                disabled={remove.isPending}
                                            >
                                                Delete
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                </div>

                {!list.isLoading && rows.length === 0 && !list.error && (
                    <div className="flex flex-col items-center gap-1 p-12 text-center">
                        <Blocks className="size-6 text-muted-foreground" />
                        <div className="text-sm font-medium">No snippets yet</div>
                        <div className="text-sm text-muted-foreground">
                            Save reusable blocks — a header, sign-off, sponsor slot, or CTA — and insert
                            them into any issue from the editor&apos;s Snippets menu.
                        </div>
                    </div>
                )}

                {list.isLoading && (
                    <div className="space-y-2 p-3">
                        {Array.from({ length: 3 }).map((_, i) => (
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

            <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : close())}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>{editing ? "Edit snippet" : "New snippet"}</DialogTitle>
                        <DialogDescription>
                            Snippets are reusable blocks inserted into an issue as a copy — editing or
                            deleting one never changes issues you&apos;ve already authored.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3">
                        <div className="space-y-2">
                            <Label htmlFor="cb-name">Name</Label>
                            <Input
                                id="cb-name"
                                value={form.name}
                                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                                placeholder="e.g. Standard sign-off"
                                maxLength={120}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="cb-desc">Description (optional)</Label>
                            <Input
                                id="cb-desc"
                                value={form.description}
                                onChange={(e) =>
                                    setForm((f) => ({ ...f, description: e.target.value }))
                                }
                                placeholder="A one-line hint shown in the menu"
                                maxLength={300}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Content</Label>
                            <NewsletterRichEditor
                                value={form.html}
                                onChange={(html) => setForm((f) => ({ ...f, html }))}
                                placeholder="Write the reusable block…"
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="secondary" onClick={close}>
                            Cancel
                        </Button>
                        <Button
                            onClick={save}
                            disabled={!form.name.trim() || !form.html.trim() || saving}
                        >
                            {saving ? "Saving…" : editing ? "Save changes" : "Create snippet"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
};
