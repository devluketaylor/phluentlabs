"use client";

import { useEffect, useState } from "react";
import { trpc } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { NewsletterRichEditor } from "@/components/admin/newsletter-rich-editor";

type NewsletterStatus = "draft" | "scheduled" | "sent";

const STATUS_STYLES: Record<NewsletterStatus, string> = {
    draft: "bg-muted text-muted-foreground",
    scheduled: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
    sent: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
};

function StatusBadge({ status }: { status: string }) {
    return (
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ${STATUS_STYLES[status as NewsletterStatus] ?? "bg-muted text-muted-foreground"}`}>
            {status}
        </span>
    );
}

export function NewslettersTable() {
    const utils = trpc.useUtils();

    const list = trpc.adminNewsletter.list.useQuery({ limit: 50, offset: 0 });

    const update = trpc.adminNewsletter.update.useMutation({
        onSuccess: () => utils.adminNewsletter.list.invalidate(),
    });

    const del = trpc.adminNewsletter.delete.useMutation({
        onSuccess: () => utils.adminNewsletter.list.invalidate(),
    });

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <Button
                    variant="secondary"
                    onClick={() => list.refetch()}
                    disabled={list.isFetching}
                >
                    {list.isFetching ? "Refreshing…" : "Refresh"}
                </Button>
            </div>

            <Card className="overflow-hidden">
                <div className="grid grid-cols-12 gap-2 border-b bg-muted/30 px-3 py-2 text-xs font-medium text-muted-foreground">
                    <div className="col-span-4">Subject</div>
                    <div className="col-span-3">Preheader</div>
                    <div className="col-span-2">Status</div>
                    <div className="col-span-2">Created</div>
                    <div className="col-span-1 text-right">Actions</div>
                </div>

                {list.data?.items.map((n) => (
                    <div key={n.id} className="grid grid-cols-12 gap-2 px-3 py-2 items-center border-b last:border-0">
                        <div className="col-span-4 truncate text-sm font-medium">{n.subject}</div>
                        <div className="col-span-3 truncate text-sm text-muted-foreground">
                            {n.preheader ?? "—"}
                        </div>
                        <div className="col-span-2">
                            <StatusBadge status={n.status} />
                        </div>
                        <div className="col-span-2 text-xs text-muted-foreground">
                            {new Date(n.createdAt).toLocaleDateString(undefined, {
                                month: "short",
                                day: "numeric",
                                year: "numeric",
                            })}
                        </div>
                        <div className="col-span-1 flex justify-end gap-1">
                            <EditNewsletterDialog
                                newsletter={n}
                                onSave={(data) => update.mutate(data)}
                                saving={update.isPending}
                            />
                            <Button
                                variant="destructive"
                                size="sm"
                                onClick={() => del.mutate({ id: n.id })}
                                disabled={del.isPending}
                            >
                                Delete
                            </Button>
                        </div>
                    </div>
                ))}

                {!list.isLoading && (list.data?.items.length ?? 0) === 0 && (
                    <div className="p-10 text-center text-sm text-muted-foreground">
                        No newsletters yet.
                    </div>
                )}

                {list.isLoading && (
                    <div className="p-10 text-center text-sm text-muted-foreground">
                        Loading…
                    </div>
                )}

                {list.error && (
                    <div className="p-4 text-sm text-destructive">{list.error.message}</div>
                )}
            </Card>
        </div>
    );
}

function EditNewsletterDialog({
    newsletter,
    onSave,
    saving,
}: {
    newsletter: {
        id: string;
        subject: string;
        preheader: string | null;
        html: string;
        status: string;
    };
    onSave: (data: {
        id: string;
        subject: string;
        html: string;
        preheader?: string;
        status: NewsletterStatus;
    }) => void;
    saving: boolean;
}) {
    const [open, setOpen] = useState(false);
    const [subject, setSubject] = useState(newsletter.subject);
    const [preheader, setPreheader] = useState(newsletter.preheader ?? "");
    const [html, setHtml] = useState(newsletter.html);
    const [status, setStatus] = useState<NewsletterStatus>(newsletter.status as NewsletterStatus);

    useEffect(() => {
        if (!open) return;
        setSubject(newsletter.subject);
        setPreheader(newsletter.preheader ?? "");
        setHtml(newsletter.html);
        setStatus(newsletter.status as NewsletterStatus);
    }, [open, newsletter]);

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button size="sm" variant="secondary">Edit</Button>
            </DialogTrigger>

            <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Edit newsletter</DialogTitle>
                </DialogHeader>

                <div className="space-y-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                            <div className="text-sm font-medium">Subject</div>
                            <Input
                                value={subject}
                                onChange={(e) => setSubject(e.target.value)}
                                placeholder="Subject line"
                            />
                        </div>
                        <div className="space-y-2">
                            <div className="text-sm font-medium">Status</div>
                            <Select value={status} onValueChange={(v) => setStatus(v as NewsletterStatus)}>
                                <SelectTrigger className="w-full">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="draft">Draft</SelectItem>
                                    <SelectItem value="scheduled">Scheduled</SelectItem>
                                    <SelectItem value="sent">Sent</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <div className="text-sm font-medium">Preheader <span className="text-muted-foreground font-normal">(optional)</span></div>
                        <Input
                            value={preheader}
                            onChange={(e) => setPreheader(e.target.value)}
                            placeholder="Short preview text shown in email clients"
                        />
                    </div>

                    <div className="space-y-2">
                        <div className="text-sm font-medium">Body</div>
                        <NewsletterRichEditor
                            value={html}
                            onChange={setHtml}
                            placeholder="Write the email body"
                        />
                    </div>

                    <div className="flex justify-end gap-2 pt-2">
                        <Button variant="secondary" onClick={() => setOpen(false)}>
                            Cancel
                        </Button>
                        <Button
                            disabled={saving || !subject.trim()}
                            onClick={() => {
                                onSave({
                                    id: newsletter.id,
                                    subject,
                                    html,
                                    preheader: preheader.trim() || undefined,
                                    status,
                                });
                                setOpen(false);
                            }}
                        >
                            Save changes
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
