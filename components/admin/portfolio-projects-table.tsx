"use client";

import { trpc } from "@/trpc/client";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
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
import { FolderGit2, Plus } from "lucide-react";

type Project = {
    id: string;
    title: string;
    description: string;
    repoUrl: string | null;
    liveUrl: string | null;
    image: string | null;
    tech: string;
    featured: boolean;
    published: boolean;
    sortOrder: number;
    createdAt: string | Date;
    updatedAt: string | Date;
};

type Form = {
    title: string;
    description: string;
    repoUrl: string;
    liveUrl: string;
    image: string;
    tech: string;
    featured: boolean;
    published: boolean;
    sortOrder: string;
};

const emptyForm: Form = {
    title: "",
    description: "",
    repoUrl: "",
    liveUrl: "",
    image: "",
    tech: "",
    featured: false,
    published: true,
    sortOrder: "0",
};

const parseTech = (s: string) =>
    s
        .split(/[,\n]/)
        .map((t) => t.trim())
        .filter(Boolean);

export const PortfolioProjectsTable = () => {
    const utils = trpc.useUtils();
    const list = trpc.adminPortfolio.listProjects.useQuery();
    const rows = (list.data?.rows ?? []) as Project[];

    const [open, setOpen] = useState(false);
    const [editing, setEditing] = useState<Project | null>(null);
    const [form, setForm] = useState<Form>(emptyForm);

    const invalidate = () => void utils.adminPortfolio.listProjects.invalidate();

    const create = trpc.adminPortfolio.createProject.useMutation({
        onSuccess: () => {
            toast.success("Project created");
            close();
            invalidate();
        },
        onError: (e) => toast.error(e.message),
    });

    const update = trpc.adminPortfolio.updateProject.useMutation({
        onSuccess: () => {
            toast.success("Project updated");
            close();
            invalidate();
        },
        onError: (e) => toast.error(e.message),
    });

    const remove = trpc.adminPortfolio.removeProject.useMutation({
        onSuccess: () => {
            toast.success("Project deleted");
            invalidate();
        },
        onError: (e) => toast.error(e.message),
    });

    const openCreate = () => {
        setEditing(null);
        setForm(emptyForm);
        setOpen(true);
    };

    const openEdit = (p: Project) => {
        setEditing(p);
        setForm({
            title: p.title,
            description: p.description,
            repoUrl: p.repoUrl ?? "",
            liveUrl: p.liveUrl ?? "",
            image: p.image ?? "",
            tech: (p.tech ?? "").split("\n").filter(Boolean).join(", "),
            featured: p.featured,
            published: p.published,
            sortOrder: String(p.sortOrder ?? 0),
        });
        setOpen(true);
    };

    const close = () => {
        setOpen(false);
        setEditing(null);
        setForm(emptyForm);
    };

    const save = () => {
        const title = form.title.trim();
        if (!title) return;
        const payload = {
            title,
            description: form.description,
            repoUrl: form.repoUrl.trim() || undefined,
            liveUrl: form.liveUrl.trim() || undefined,
            image: form.image.trim() || undefined,
            tech: parseTech(form.tech),
            featured: form.featured,
            published: form.published,
            sortOrder: Number.parseInt(form.sortOrder, 10) || 0,
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
                    New project
                </Button>
            </div>

            <Card className="overflow-hidden">
                <div className="max-h-[70vh] overflow-auto">
                    <div className="min-w-[560px]">
                        <Table>
                            <TableHeader stickyHeader>
                                <TableRow className="hover:bg-transparent">
                                    <TableHead>Title</TableHead>
                                    <TableHead className="w-[100px]">Featured</TableHead>
                                    <TableHead className="w-[90px]">Order</TableHead>
                                    <TableHead className="w-[100px]">Status</TableHead>
                                    <TableHead className="w-[160px] text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {rows.map((p) => (
                                    <TableRow key={p.id}>
                                        <TableCell className="font-medium align-top">
                                            {p.title}
                                            {p.description && (
                                                <div className="text-xs text-muted-foreground line-clamp-1">
                                                    {p.description}
                                                </div>
                                            )}
                                        </TableCell>
                                        <TableCell className="align-top text-xs text-muted-foreground">
                                            {p.featured ? "★" : "—"}
                                        </TableCell>
                                        <TableCell className="align-top text-xs text-muted-foreground">
                                            {p.sortOrder}
                                        </TableCell>
                                        <TableCell className="align-top">
                                            <span
                                                className={
                                                    "eyebrow inline-block border border-border px-2 py-0.5 text-[10px] " +
                                                    (p.published
                                                        ? "text-foreground"
                                                        : "text-muted-foreground")
                                                }
                                            >
                                                {p.published ? "Live" : "Hidden"}
                                            </span>
                                        </TableCell>
                                        <TableCell className="text-right align-top space-x-1">
                                            <Button variant="ghost" size="sm" onClick={() => openEdit(p)}>
                                                Edit
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="text-destructive hover:text-destructive"
                                                onClick={() => {
                                                    if (confirm(`Delete the project "${p.title}"?`))
                                                        remove.mutate({ id: p.id });
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
                        <FolderGit2 className="size-6 text-muted-foreground" />
                        <div className="text-sm font-medium">No projects yet</div>
                        <div className="text-sm text-muted-foreground">
                            Add the projects you want featured on your portfolio.
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
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>{editing ? "Edit project" : "New project"}</DialogTitle>
                        <DialogDescription>
                            Projects show as cards on your portfolio. Featured ones surface first.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3">
                        <div className="space-y-2">
                            <Label htmlFor="pr-title">Title</Label>
                            <Input
                                id="pr-title"
                                value={form.title}
                                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                                placeholder="Project name"
                                maxLength={200}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="pr-desc">Description</Label>
                            <Textarea
                                id="pr-desc"
                                value={form.description}
                                onChange={(e) =>
                                    setForm((f) => ({ ...f, description: e.target.value }))
                                }
                                placeholder="What it does, what you learned…"
                                rows={3}
                                maxLength={2000}
                            />
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div className="space-y-2">
                                <Label htmlFor="pr-repo">Repo URL (optional)</Label>
                                <Input
                                    id="pr-repo"
                                    value={form.repoUrl}
                                    onChange={(e) => setForm((f) => ({ ...f, repoUrl: e.target.value }))}
                                    placeholder="https://github.com/…"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="pr-live">Live URL (optional)</Label>
                                <Input
                                    id="pr-live"
                                    value={form.liveUrl}
                                    onChange={(e) => setForm((f) => ({ ...f, liveUrl: e.target.value }))}
                                    placeholder="https://…"
                                />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="pr-image">Image URL (optional)</Label>
                            <Input
                                id="pr-image"
                                value={form.image}
                                onChange={(e) => setForm((f) => ({ ...f, image: e.target.value }))}
                                placeholder="https://…"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="pr-tech">Tech (comma-separated)</Label>
                            <Input
                                id="pr-tech"
                                value={form.tech}
                                onChange={(e) => setForm((f) => ({ ...f, tech: e.target.value }))}
                                placeholder="TypeScript, Next.js, Postgres"
                            />
                        </div>
                        <div className="flex flex-wrap items-center gap-6 pt-1">
                            <div className="flex items-center gap-2">
                                <Switch
                                    id="pr-featured"
                                    checked={form.featured}
                                    onCheckedChange={(v) => setForm((f) => ({ ...f, featured: v }))}
                                />
                                <Label htmlFor="pr-featured" className="cursor-pointer">
                                    Featured
                                </Label>
                            </div>
                            <div className="flex items-center gap-2">
                                <Switch
                                    id="pr-published"
                                    checked={form.published}
                                    onCheckedChange={(v) => setForm((f) => ({ ...f, published: v }))}
                                />
                                <Label htmlFor="pr-published" className="cursor-pointer">
                                    Live
                                </Label>
                            </div>
                            <div className="flex items-center gap-2">
                                <Label htmlFor="pr-order">Order</Label>
                                <Input
                                    id="pr-order"
                                    type="number"
                                    className="w-20"
                                    value={form.sortOrder}
                                    onChange={(e) =>
                                        setForm((f) => ({ ...f, sortOrder: e.target.value }))
                                    }
                                />
                            </div>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="secondary" onClick={close}>
                            Cancel
                        </Button>
                        <Button onClick={save} disabled={!form.title.trim() || saving}>
                            {saving ? "Saving…" : editing ? "Save changes" : "Create project"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
};
