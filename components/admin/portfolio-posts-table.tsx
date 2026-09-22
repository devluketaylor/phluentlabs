"use client";

import { trpc } from "@/trpc/client";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
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
import { FileText, Plus } from "lucide-react";

type Post = {
    id: string;
    slug: string;
    title: string;
    description: string | null;
    body: string;
    coverImage: string | null;
    tags: string;
    published: boolean;
    publishedAt: string | Date | null;
    createdAt: string | Date;
    updatedAt: string | Date;
};

type Form = {
    title: string;
    slug: string;
    description: string;
    body: string;
    coverImage: string;
    tags: string;
    published: boolean;
};

const emptyForm: Form = {
    title: "",
    slug: "",
    description: "",
    body: "",
    coverImage: "",
    tags: "",
    published: false,
};

// tags round-trip as a comma/newline string in the input; array over the wire.
const parseTags = (s: string) =>
    s
        .split(/[,\n]/)
        .map((t) => t.trim())
        .filter(Boolean);

export const PortfolioPostsTable = () => {
    const utils = trpc.useUtils();
    const list = trpc.adminPortfolio.listPosts.useQuery();
    const rows = (list.data?.rows ?? []) as Post[];

    const [open, setOpen] = useState(false);
    const [editing, setEditing] = useState<Post | null>(null);
    const [form, setForm] = useState<Form>(emptyForm);

    const invalidate = () => void utils.adminPortfolio.listPosts.invalidate();

    const create = trpc.adminPortfolio.createPost.useMutation({
        onSuccess: () => {
            toast.success("Post created");
            close();
            invalidate();
        },
        onError: (e) => toast.error(e.message),
    });

    const update = trpc.adminPortfolio.updatePost.useMutation({
        onSuccess: () => {
            toast.success("Post updated");
            close();
            invalidate();
        },
        onError: (e) => toast.error(e.message),
    });

    const remove = trpc.adminPortfolio.removePost.useMutation({
        onSuccess: () => {
            toast.success("Post deleted");
            invalidate();
        },
        onError: (e) => toast.error(e.message),
    });

    const openCreate = () => {
        setEditing(null);
        setForm(emptyForm);
        setOpen(true);
    };

    const openEdit = (p: Post) => {
        setEditing(p);
        setForm({
            title: p.title,
            slug: p.slug,
            description: p.description ?? "",
            body: p.body,
            coverImage: p.coverImage ?? "",
            tags: (p.tags ?? "").split("\n").filter(Boolean).join(", "),
            published: p.published,
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
            slug: form.slug.trim() || undefined,
            description: form.description.trim() || undefined,
            body: form.body,
            coverImage: form.coverImage.trim() || undefined,
            tags: parseTags(form.tags),
            published: form.published,
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
                    New post
                </Button>
            </div>

            <Card className="overflow-hidden">
                <div className="max-h-[70vh] overflow-auto">
                    <div className="min-w-[560px]">
                        <Table>
                            <TableHeader stickyHeader>
                                <TableRow className="hover:bg-transparent">
                                    <TableHead>Title</TableHead>
                                    <TableHead className="w-[120px]">Status</TableHead>
                                    <TableHead className="w-[160px]">Slug</TableHead>
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
                                        <TableCell className="align-top">
                                            <span
                                                className={
                                                    "eyebrow inline-block border border-border px-2 py-0.5 text-[10px] " +
                                                    (p.published
                                                        ? "text-foreground"
                                                        : "text-muted-foreground")
                                                }
                                            >
                                                {p.published ? "Published" : "Draft"}
                                            </span>
                                        </TableCell>
                                        <TableCell className="align-top text-xs text-muted-foreground">
                                            /{p.slug}
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
                                                    if (confirm(`Delete the post "${p.title}"?`))
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
                        <FileText className="size-6 text-muted-foreground" />
                        <div className="text-sm font-medium">No posts yet</div>
                        <div className="text-sm text-muted-foreground">
                            Write your first blog post — it goes live on luketaylor.io when you publish.
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
                <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>{editing ? "Edit post" : "New post"}</DialogTitle>
                        <DialogDescription>
                            Published posts appear on luketaylor.io within about a minute. Drafts stay
                            private until you publish.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3">
                        <div className="space-y-2">
                            <Label htmlFor="pp-title">Title</Label>
                            <Input
                                id="pp-title"
                                value={form.title}
                                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                                placeholder="How I built…"
                                maxLength={200}
                            />
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div className="space-y-2">
                                <Label htmlFor="pp-slug">Slug (optional)</Label>
                                <Input
                                    id="pp-slug"
                                    value={form.slug}
                                    onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
                                    placeholder="auto from title"
                                    maxLength={80}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="pp-tags">Tags (comma-separated)</Label>
                                <Input
                                    id="pp-tags"
                                    value={form.tags}
                                    onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))}
                                    placeholder="nextjs, react, life"
                                />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="pp-desc">Description (optional)</Label>
                            <Input
                                id="pp-desc"
                                value={form.description}
                                onChange={(e) =>
                                    setForm((f) => ({ ...f, description: e.target.value }))
                                }
                                placeholder="One-line summary for cards and SEO"
                                maxLength={500}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="pp-cover">Cover image URL (optional)</Label>
                            <Input
                                id="pp-cover"
                                value={form.coverImage}
                                onChange={(e) =>
                                    setForm((f) => ({ ...f, coverImage: e.target.value }))
                                }
                                placeholder="https://…"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Body</Label>
                            <NewsletterRichEditor
                                value={form.body}
                                onChange={(html) => setForm((f) => ({ ...f, body: html }))}
                                placeholder="Write your post…"
                            />
                        </div>
                        <div className="flex items-center gap-2 pt-1">
                            <Switch
                                id="pp-pub"
                                checked={form.published}
                                onCheckedChange={(v) => setForm((f) => ({ ...f, published: v }))}
                            />
                            <Label htmlFor="pp-pub" className="cursor-pointer">
                                Published
                            </Label>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="secondary" onClick={close}>
                            Cancel
                        </Button>
                        <Button onClick={save} disabled={!form.title.trim() || saving}>
                            {saving ? "Saving…" : editing ? "Save changes" : "Create post"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
};
