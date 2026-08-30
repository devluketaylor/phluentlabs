"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
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
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
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
import { renderNewsletterEmailPreview } from "@/lib/emails/newsletter-preview";

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

    const [page, setPage] = useState(0);
    const pageSize = 25;

    const list = trpc.adminNewsletter.list.useQuery(
        { limit: pageSize, offset: page * pageSize },
        { placeholderData: (prev) => prev }
    );

    const total = list.data?.total ?? 0;
    const itemCount = list.data?.items.length ?? 0;
    const pageCount = Math.max(1, Math.ceil(total / pageSize));
    const rangeStart = total === 0 ? 0 : page * pageSize + 1;
    const rangeEnd = Math.min(total, page * pageSize + itemCount);

    // If the current page falls out of range (e.g. after deletes shrink the
    // list), clamp back to the last valid page.
    useEffect(() => {
        if (page > pageCount - 1) setPage(pageCount - 1);
    }, [page, pageCount]);

    const update = trpc.adminNewsletter.update.useMutation({
        onSuccess: () => {
            utils.adminNewsletter.list.invalidate();
            toast.success("Newsletter updated");
        },
        onError: (err) => toast.error(err.message || "Failed to update newsletter"),
    });

    const del = trpc.adminNewsletter.delete.useMutation({
        onSuccess: () => {
            utils.adminNewsletter.list.invalidate();
            toast.success("Newsletter deleted");
        },
        onError: (err) => toast.error(err.message || "Failed to delete newsletter"),
    });

    const send = trpc.adminNewsletter.send.useMutation({
        onSuccess: (res) => {
            utils.adminNewsletter.list.invalidate();
            const sent = (res as { sent?: number } | undefined)?.sent;
            toast.success(
                typeof sent === "number"
                    ? `Newsletter sent to ${sent} subscriber${sent === 1 ? "" : "s"}`
                    : "Newsletter sent"
            );
        },
        onError: (err) => toast.error(err.message || "Failed to send newsletter"),
    });

    const sendTest = trpc.adminNewsletter.sendTest.useMutation({
        onSuccess: () => toast.success("Test email sent"),
        onError: (err) => toast.error(err.message || "Failed to send test"),
    });

    const schedule = trpc.adminNewsletter.schedule.useMutation({
        onSuccess: (_res, vars) => {
            utils.adminNewsletter.list.invalidate();
            toast.success(
                (vars as { scheduledAt?: string | null } | undefined)?.scheduledAt
                    ? "Newsletter scheduled"
                    : "Newsletter unscheduled"
            );
        },
        onError: (err) => toast.error(err.message || "Failed to schedule newsletter"),
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
              <div className="max-h-[70vh] overflow-auto">
                <div className="min-w-[860px]">
                <Table>
                    <TableHeader stickyHeader>
                        <TableRow className="hover:bg-transparent">
                            <TableHead>Subject</TableHead>
                            <TableHead>Preheader</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Created</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {list.data?.items.map((n) => (
                            <TableRow key={n.id}>
                                <TableCell className="max-w-[280px] truncate font-medium">{n.subject}</TableCell>
                                <TableCell className="max-w-[220px] truncate text-muted-foreground">
                                    {n.preheader ?? "—"}
                                </TableCell>
                                <TableCell>
                                    <StatusBadge status={n.status} />
                                </TableCell>
                                <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                                    {new Date(n.createdAt).toLocaleDateString(undefined, {
                                        month: "short",
                                        day: "numeric",
                                        year: "numeric",
                                    })}
                                </TableCell>
                                <TableCell>
                                    <div className="flex justify-end gap-1">
                                        <PreviewNewsletterDialog newsletter={n} />
                                        <TestSendDialog
                                            newsletter={n}
                                            onSendTest={(to) => sendTest.mutateAsync({ id: n.id, to })}
                                        />
                                        <EditNewsletterDialog
                                            newsletter={n}
                                            onSave={(data) => update.mutate(data)}
                                            saving={update.isPending}
                                        />
                                        {n.status !== "sent" && (
                                            <ScheduleDialog
                                                newsletter={n}
                                                onSchedule={(scheduledAt) =>
                                                    schedule.mutateAsync({ id: n.id, scheduledAt })
                                                }
                                            />
                                        )}
                                        {n.status !== "sent" && (
                                            <SendNewsletterDialog
                                                newsletter={n}
                                                onSend={(tag) => send.mutate({ id: n.id, tag })}
                                                sending={send.isPending}
                                                error={send.error?.message}
                                            />
                                        )}
                                        <Button
                                            variant="destructive"
                                            size="sm"
                                            onClick={() => del.mutate({ id: n.id })}
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

                {!list.isLoading && (list.data?.items.length ?? 0) === 0 && !list.error && (
                    <div className="flex flex-col items-center gap-1 p-12 text-center">
                        <div className="text-sm font-medium">No newsletters yet</div>
                        <div className="text-sm text-muted-foreground">
                            Create your first issue to see it listed here.
                        </div>
                    </div>
                )}

                {list.isLoading && (
                    <div className="space-y-2 p-3">
                        {Array.from({ length: 6 }).map((_, i) => (
                            <div key={i} className="flex items-center gap-3">
                                <div className="h-4 flex-1 rounded bg-muted animate-pulse" />
                                <div className="h-4 w-32 rounded bg-muted animate-pulse" />
                                <div className="h-4 w-16 rounded bg-muted animate-pulse" />
                                <div className="h-4 w-20 rounded bg-muted animate-pulse" />
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
                        ? "No newsletters"
                        : `Showing ${rangeStart}\u2013${rangeEnd} of ${total} newsletter${total === 1 ? "" : "s"}`}
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
}

function ScheduleDialog({
    newsletter,
    onSchedule,
}: {
    newsletter: { subject: string; status: string; scheduledAt?: Date | string | null };
    onSchedule: (scheduledAt: string | null) => Promise<unknown>;
}) {
    const [open, setOpen] = useState(false);
    const [value, setValue] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const isScheduled = newsletter.status === "scheduled";

    const submit = async (clear: boolean) => {
        setBusy(true);
        setError(null);
        try {
            // datetime-local gives local wall-clock; convert to ISO for the server.
            await onSchedule(clear ? null : new Date(value).toISOString());
            setOpen(false);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to schedule");
        } finally {
            setBusy(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button size="sm" variant="outline">
                    {isScheduled ? "Reschedule" : "Schedule"}
                </Button>
            </DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Schedule send</DialogTitle>
                </DialogHeader>
                <p className="text-sm text-muted-foreground">
                    Pick when{" "}
                    <span className="font-medium text-foreground">&ldquo;{newsletter.subject}&rdquo;</span>{" "}
                    should go out to all subscribers.
                </p>
                <Input
                    type="datetime-local"
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                />
                {error && <p className="text-sm text-destructive">{error}</p>}
                <DialogFooter className="gap-2">
                    {isScheduled && (
                        <Button variant="secondary" onClick={() => submit(true)} disabled={busy}>
                            Unschedule
                        </Button>
                    )}
                    <Button onClick={() => submit(false)} disabled={busy || !value}>
                        {busy ? "Saving…" : "Schedule"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function PreviewNewsletterDialog({
    newsletter,
}: {
    newsletter: { subject: string; preheader: string | null; html: string };
}) {
    const [open, setOpen] = useState(false);
    const [mode, setMode] = useState<"web" | "email">("web");
    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button size="sm" variant="outline">Preview</Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
                <DialogHeader>
                    <DialogTitle className="truncate">{newsletter.subject}</DialogTitle>
                    {newsletter.preheader && (
                        <p className="text-sm text-muted-foreground">{newsletter.preheader}</p>
                    )}
                </DialogHeader>
                <div className="flex items-center gap-1">
                    <Button
                        type="button"
                        size="sm"
                        variant={mode === "web" ? "default" : "secondary"}
                        onClick={() => setMode("web")}
                    >
                        Web
                    </Button>
                    <Button
                        type="button"
                        size="sm"
                        variant={mode === "email" ? "default" : "secondary"}
                        onClick={() => setMode("email")}
                    >
                        Email
                    </Button>
                </div>
                {mode === "web" ? (
                    <div className="overflow-y-auto rounded-md border bg-background p-6">
                        <div
                            className="prose prose-sm dark:prose-invert max-w-none"
                            dangerouslySetInnerHTML={{ __html: newsletter.html }}
                        />
                    </div>
                ) : (
                    <div className="overflow-hidden rounded-md border bg-muted">
                        <iframe
                            title="Email preview"
                            sandbox=""
                            className="h-[55vh] w-full border-0 bg-white"
                            srcDoc={renderNewsletterEmailPreview({ html: newsletter.html })}
                        />
                    </div>
                )}
                <p className="text-xs text-muted-foreground">
                    {mode === "web"
                        ? "How the issue renders on the web."
                        : "Approximates how the issue renders in an inbox (body + unsubscribe footer). Use “Test send” to check in a real client."}
                </p>
            </DialogContent>
        </Dialog>
    );
}

function TestSendDialog({
    newsletter,
    onSendTest,
}: {
    newsletter: { subject: string };
    onSendTest: (to: string) => Promise<unknown>;
}) {
    const [open, setOpen] = useState(false);
    const [to, setTo] = useState("");
    const [sending, setSending] = useState(false);
    const [result, setResult] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const handleSend = async () => {
        setSending(true);
        setError(null);
        setResult(null);
        try {
            await onSendTest(to);
            setResult(`Test sent to ${to}`);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to send test");
        } finally {
            setSending(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button size="sm" variant="outline">Test send</Button>
            </DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Send a test copy</DialogTitle>
                </DialogHeader>
                <p className="text-sm text-muted-foreground">
                    Send a single test of{" "}
                    <span className="font-medium text-foreground">&ldquo;{newsletter.subject}&rdquo;</span>{" "}
                    to an address you choose. Subscribers are not affected.
                </p>
                <Input
                    type="email"
                    placeholder="you@example.com"
                    value={to}
                    onChange={(e) => setTo(e.target.value)}
                />
                {result && <p className="text-sm text-green-600 dark:text-green-400">{result}</p>}
                {error && <p className="text-sm text-destructive">{error}</p>}
                <DialogFooter>
                    <Button variant="secondary" onClick={() => setOpen(false)} disabled={sending}>
                        Close
                    </Button>
                    <Button disabled={sending || !to.includes("@")} onClick={handleSend}>
                        {sending ? "Sending…" : "Send test"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

const ALL_AUDIENCE = "__all__";

function SendNewsletterDialog({
    newsletter,
    onSend,
    sending,
    error,
}: {
    newsletter: { id: string; subject: string };
    onSend: (tag: string | null) => void;
    sending: boolean;
    error?: string;
}) {
    const [open, setOpen] = useState(false);
    // "__all__" = every confirmed subscriber; any other value = that tag/segment.
    const [audience, setAudience] = useState<string>(ALL_AUDIENCE);
    const tag = audience === ALL_AUDIENCE ? null : audience;

    // Reset the audience each time the dialog opens so it never carries a stale
    // tag from a previous issue.
    useEffect(() => {
        if (open) setAudience(ALL_AUDIENCE);
    }, [open]);

    // All tags currently in use (for the segment dropdown).
    const tagsQuery = trpc.adminSubscribers.listTags.useQuery(undefined, { enabled: open });
    // Live count + sample of who will actually receive this issue.
    const preview = trpc.adminNewsletter.audiencePreview.useQuery(
        { tag },
        { enabled: open }
    );

    const targetCount = preview.data?.count;
    const emptyTarget = targetCount === 0;

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button size="sm" variant="default">Send</Button>
            </DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Send newsletter?</DialogTitle>
                </DialogHeader>
                <p className="text-sm text-muted-foreground">
                    This will immediately send <span className="font-medium text-foreground">&ldquo;{newsletter.subject}&rdquo;</span> to the audience below. This cannot be undone.
                </p>

                <div className="space-y-2">
                    <div className="text-sm font-medium">Audience</div>
                    <Select value={audience} onValueChange={setAudience}>
                        <SelectTrigger className="w-full">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value={ALL_AUDIENCE}>All confirmed subscribers</SelectItem>
                            {tagsQuery.data?.tags.map((t) => (
                                <SelectItem key={t.tag} value={t.tag}>
                                    Tag: {t.tag} ({t.count})
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                        {preview.isFetching
                            ? "Resolving recipients…"
                            : typeof targetCount === "number"
                              ? `Will send to ${targetCount} confirmed subscriber${targetCount === 1 ? "" : "s"}${tag ? ` tagged \u201c${tag}\u201d` : ""}.`
                              : ""}
                    </p>
                    {preview.data?.sample && preview.data.sample.length > 0 && (
                        <p className="text-xs text-muted-foreground truncate">
                            e.g. {preview.data.sample.map((s) => s.email).join(", ")}
                            {typeof targetCount === "number" && targetCount > preview.data.sample.length ? "…" : ""}
                        </p>
                    )}
                </div>

                {error && <p className="text-sm text-destructive">{error}</p>}
                <DialogFooter>
                    <Button variant="secondary" onClick={() => setOpen(false)} disabled={sending}>
                        Cancel
                    </Button>
                    <Button
                        disabled={sending || preview.isFetching || emptyTarget}
                        onClick={() => {
                            onSend(tag);
                            setOpen(false);
                        }}
                    >
                        {sending ? "Sending…" : emptyTarget ? "No recipients" : "Send now"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function EditNewsletterDialog({
    newsletter,
    onSave,
    saving,
}: {
    newsletter: {
        id: string;
        slug: string | null;
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
        slug?: string;
    }) => void;
    saving: boolean;
}) {
    const [open, setOpen] = useState(false);
    const [subject, setSubject] = useState(newsletter.subject);
    const [slug, setSlug] = useState(newsletter.slug ?? "");
    const [preheader, setPreheader] = useState(newsletter.preheader ?? "");
    const [html, setHtml] = useState(newsletter.html);
    const [status, setStatus] = useState<NewsletterStatus>(newsletter.status as NewsletterStatus);

    useEffect(() => {
        if (!open) return;
        setSubject(newsletter.subject);
        setSlug(newsletter.slug ?? "");
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
                        <div className="text-sm font-medium">Slug</div>
                        <Input
                            value={slug}
                            onChange={(e) => setSlug(e.target.value)}
                            placeholder="custom-slug (leave blank to keep existing)"
                        />
                        <p className="text-xs text-muted-foreground">URL: /issues/{slug.trim() || newsletter.slug || newsletter.id}-xxxxxxxx</p>
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
                                    slug: slug.trim() || undefined,
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
