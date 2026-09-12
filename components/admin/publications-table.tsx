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
import { Layers, Plus, Star } from "lucide-react";

type Publication = {
    id: string;
    slug: string;
    name: string;
    description: string | null;
    isPrimary: boolean;
    archivedAt: string | Date | null;
    issueCount: number;
    optInCount: number;
};

export const PublicationsTable = () => {
    const utils = trpc.useUtils();
    const list = trpc.adminPublications.list.useQuery();
    const rows = (list.data?.rows ?? []) as Publication[];

    const [createOpen, setCreateOpen] = useState(false);
    const [name, setName] = useState("");
    const [slug, setSlug] = useState("");
    const [description, setDescription] = useState("");
    const [makePrimary, setMakePrimary] = useState(false);

    // Edit state
    const [editing, setEditing] = useState<Publication | null>(null);
    const [editName, setEditName] = useState("");
    const [editDescription, setEditDescription] = useState("");

    const invalidate = () => void utils.adminPublications.list.invalidate();

    const create = trpc.adminPublications.create.useMutation({
        onSuccess: () => {
            toast.success("Publication created");
            setCreateOpen(false);
            setName("");
            setSlug("");
            setDescription("");
            setMakePrimary(false);
            invalidate();
        },
        onError: (e) => toast.error(e.message),
    });

    const update = trpc.adminPublications.update.useMutation({
        onSuccess: () => {
            toast.success("Publication updated");
            setEditing(null);
            invalidate();
        },
        onError: (e) => toast.error(e.message),
    });

    const remove = trpc.adminPublications.remove.useMutation({
        onSuccess: () => {
            toast.success("Publication deleted");
            invalidate();
        },
        onError: (e) => toast.error(e.message),
    });

    const openEdit = (p: Publication) => {
        setEditing(p);
        setEditName(p.name);
        setEditDescription(p.description ?? "");
    };

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-end">
                <Button onClick={() => setCreateOpen(true)}>
                    <Plus className="size-4" />
                    New publication
                </Button>
            </div>

            <Card className="overflow-hidden">
                <div className="max-h-[70vh] overflow-auto">
                    <div className="min-w-[680px]">
                        <Table>
                            <TableHeader stickyHeader>
                                <TableRow className="hover:bg-transparent">
                                    <TableHead>Name</TableHead>
                                    <TableHead>Slug</TableHead>
                                    <TableHead className="w-[90px] text-right">Issues</TableHead>
                                    <TableHead className="w-[110px] text-right">Opt-ins</TableHead>
                                    <TableHead className="w-[120px]">Status</TableHead>
                                    <TableHead className="w-[170px] text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {rows.map((p) => (
                                    <TableRow key={p.id}>
                                        <TableCell className="font-medium">
                                            <span className="inline-flex items-center gap-1.5">
                                                {p.isPrimary && (
                                                    <Star className="size-3.5 text-[#ff5c5c]" fill="#ff5c5c" />
                                                )}
                                                {p.name}
                                            </span>
                                            {p.description && (
                                                <div className="text-xs text-muted-foreground">{p.description}</div>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                                                {p.slug}
                                            </code>
                                        </TableCell>
                                        <TableCell className="text-right text-muted-foreground">
                                            {p.issueCount}
                                        </TableCell>
                                        <TableCell className="text-right text-muted-foreground">
                                            {p.optInCount}
                                        </TableCell>
                                        <TableCell>
                                            {p.isPrimary ? (
                                                <span className="inline-flex items-center rounded-full border border-[#ff5c5c]/40 bg-[#ff5c5c]/10 px-2 py-0.5 text-xs font-medium text-[#ff5c5c]">
                                                    Primary
                                                </span>
                                            ) : p.archivedAt ? (
                                                <span className="inline-flex items-center rounded-full border border-muted-foreground/30 bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                                                    Archived
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                                                    Active
                                                </span>
                                            )}
                                        </TableCell>
                                        <TableCell className="text-right space-x-1">
                                            <Button variant="ghost" size="sm" onClick={() => openEdit(p)}>
                                                Edit
                                            </Button>
                                            {!p.isPrimary && (
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() =>
                                                        update.mutate({
                                                            id: p.id,
                                                            name: p.name,
                                                            description: p.description,
                                                            isPrimary: true,
                                                        })
                                                    }
                                                    disabled={update.isPending}
                                                >
                                                    Make primary
                                                </Button>
                                            )}
                                            {!p.isPrimary && (
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="text-destructive hover:text-destructive"
                                                    onClick={() => {
                                                        if (
                                                            confirm(
                                                                `Delete "${p.name}"? Its ${p.issueCount} issue(s) fall back to the primary stream and opt-ins are removed.`,
                                                            )
                                                        )
                                                            remove.mutate({ id: p.id });
                                                    }}
                                                    disabled={remove.isPending}
                                                >
                                                    Delete
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
                        <Layers className="size-6 text-muted-foreground" />
                        <div className="text-sm font-medium">No publications yet</div>
                        <div className="text-sm text-muted-foreground">
                            Everything currently ships as one stream. Create a publication to run more than
                            one newsletter with per-publication opt-in.
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

                {list.error && <div className="p-4 text-sm text-destructive">{list.error.message}</div>}
            </Card>

            {/* Create dialog */}
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Create publication</DialogTitle>
                        <DialogDescription>
                            A publication is a separate newsletter stream. The first one you create becomes
                            the primary/default stream automatically.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3">
                        <div className="space-y-2">
                            <Label htmlFor="pub-name">Name</Label>
                            <Input
                                id="pub-name"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="e.g. Phluent Deep Dives"
                                maxLength={120}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="pub-slug">Slug (optional)</Label>
                            <Input
                                id="pub-slug"
                                value={slug}
                                onChange={(e) => setSlug(e.target.value)}
                                placeholder="auto from name"
                                maxLength={60}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="pub-desc">Description (optional)</Label>
                            <textarea
                                id="pub-desc"
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                placeholder="What this stream is about"
                                maxLength={500}
                                rows={3}
                                className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                            />
                        </div>
                        <label className="flex items-center gap-2 text-sm">
                            <input
                                type="checkbox"
                                checked={makePrimary}
                                onChange={(e) => setMakePrimary(e.target.checked)}
                                className="accent-[#ff5c5c]"
                            />
                            Make this the primary stream
                        </label>
                    </div>
                    <DialogFooter>
                        <Button variant="secondary" onClick={() => setCreateOpen(false)}>
                            Cancel
                        </Button>
                        <Button
                            onClick={() =>
                                create.mutate({
                                    name: name.trim(),
                                    slug: slug.trim() || undefined,
                                    description: description.trim() || undefined,
                                    isPrimary: makePrimary,
                                })
                            }
                            disabled={!name.trim() || create.isPending}
                        >
                            {create.isPending ? "Creating…" : "Create"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Edit dialog */}
            <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Edit publication</DialogTitle>
                        <DialogDescription>Update the name or description.</DialogDescription>
                    </DialogHeader>
                    {editing && (
                        <div className="space-y-3">
                            <div className="space-y-2">
                                <Label htmlFor="edit-pub-name">Name</Label>
                                <Input
                                    id="edit-pub-name"
                                    value={editName}
                                    onChange={(e) => setEditName(e.target.value)}
                                    maxLength={120}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="edit-pub-desc">Description</Label>
                                <textarea
                                    id="edit-pub-desc"
                                    value={editDescription}
                                    onChange={(e) => setEditDescription(e.target.value)}
                                    maxLength={500}
                                    rows={3}
                                    className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                />
                            </div>
                            {!editing.isPrimary && (
                                <label className="flex items-center gap-2 text-sm text-muted-foreground">
                                    <input
                                        type="checkbox"
                                        checked={!!editing.archivedAt}
                                        onChange={(e) =>
                                            update.mutate({
                                                id: editing.id,
                                                name: editName.trim() || editing.name,
                                                description: editDescription.trim() || null,
                                                archived: e.target.checked,
                                            })
                                        }
                                        className="accent-[#ff5c5c]"
                                    />
                                    Archived (stops new opt-ins, hidden from public)
                                </label>
                            )}
                        </div>
                    )}
                    <DialogFooter>
                        <Button variant="secondary" onClick={() => setEditing(null)}>
                            Cancel
                        </Button>
                        <Button
                            onClick={() =>
                                editing &&
                                update.mutate({
                                    id: editing.id,
                                    name: editName.trim(),
                                    description: editDescription.trim() || null,
                                })
                            }
                            disabled={!editName.trim() || update.isPending}
                        >
                            {update.isPending ? "Saving…" : "Save"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
};
