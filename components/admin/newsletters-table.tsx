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
    DialogFooter,
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

    const send = trpc.adminNewsletter.send.useMutation({
        onSuccess: () => utils.adminNewsletter.list.invalidate(),
    });

    const sendTest = trpc.adminNewsletter.sendTest.useMutation();

    const schedule = trpc.adminNewsletter.schedule.useMutation({
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
              <div className="overflow-x-auto">
                <div className="min-w-[860px]">
                <div className="grid grid-cols-12 gap-2 border-b bg-muted/30 px-3 py-2 text-xs font-medium text-muted-foreground">
                    <div className="col-span-3">Subject</div>
                    <div className="col-span-2">Preheader</div>
                    <div className="col-span-2">Status</div>
                    <div className="col-span-2">Created</div>
                    <div className="col-span-3 text-right">Actions</div>
                </div>

                {list.data?.items.map((n) => (
                    <div key={n.id} className="grid grid-cols-12 gap-2 px-3 py-2 items-center border-b last:border-0">
                        <div className="col-span-3 truncate text-sm font-medium">{n.subject}</div>
                        <div className="col-span-2 truncate text-sm text-muted-foreground">
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
                        <div className="col-span-3 flex justify-end gap-1">
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
                                    onSend={() => send.mutate({ id: n.id })}
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
                    </div>
                ))}
                </div>
              </div>

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
                <div className="overflow-y-auto rounded-md border bg-background p-6">
                    <div
                        className="prose prose-sm dark:prose-invert max-w-none"
                        dangerouslySetInnerHTML={{ __html: newsletter.html }}
                    />
                </div>
                <p className="text-xs text-muted-foreground">
                    This is how the issue renders on the web. Use “Test send” to check it in an email client.
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

function SendNewsletterDialog({
    newsletter,
    onSend,
    sending,
    error,
}: {
    newsletter: { id: string; subject: string };
    onSend: () => void;
    sending: boolean;
    error?: string;
}) {
    const [open, setOpen] = useState(false);

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
                    This will immediately send <span className="font-medium text-foreground">&ldquo;{newsletter.subject}&rdquo;</span> to all active subscribers. This cannot be undone.
                </p>
                {error && <p className="text-sm text-destructive">{error}</p>}
                <DialogFooter>
                    <Button variant="secondary" onClick={() => setOpen(false)} disabled={sending}>
                        Cancel
                    </Button>
                    <Button
                        disabled={sending}
                        onClick={() => {
                            onSend();
                            setOpen(false);
                        }}
                    >
                        {sending ? "Sending…" : "Send now"}
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
