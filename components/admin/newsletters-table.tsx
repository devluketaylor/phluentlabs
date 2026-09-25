"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectLabel,
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
import { IssueLintPanel, SendReadinessChecklist } from "@/components/admin/issue-lint-panel";
import { SubjectMeter } from "@/components/admin/subject-meter";
import { buildSubjectVariants } from "@/lib/subject-variants";
import { renderNewsletterEmailPreview } from "@/lib/emails/newsletter-preview";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { BarChart3, Link2, Check, Copy, UserRound, Users, RotateCcw } from "lucide-react";

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
    const router = useRouter();
    const searchParams = useSearchParams();

    const [page, setPage] = useState(0);
    const pageSize = 25;

    // One-click resend-to-non-openers hand-off from a sent issue's analytics
    // page: it duplicates the issue into a fresh draft, then routes here with
    // ?draft=<newDraftId>&resend=<originalSentIssueId> so we can auto-open that
    // draft's Send dialog with the "non-openers of the original" audience
    // pre-selected. We capture the params once, then strip them from the URL so
    // a refresh doesn't re-trigger the dialog.
    const [resendHandoff, setResendHandoff] = useState<{
        draftId: string;
        sourceId: string;
    } | null>(null);
    useEffect(() => {
        const draftId = searchParams.get("draft");
        const sourceId = searchParams.get("resend");
        if (draftId && sourceId) {
            setResendHandoff({ draftId, sourceId });
            setPage(0);
            // Clean the URL (no history entry) so a reload won't re-open it.
            router.replace("/admin/newsletters");
        }
        // Only run on mount / when the query string first arrives.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

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

    const duplicate = trpc.adminNewsletter.duplicate.useMutation({
        onSuccess: () => {
            utils.adminNewsletter.list.invalidate();
            setPage(0);
            toast.success("Duplicated as a new draft");
        },
        onError: (err) => toast.error(err.message || "Failed to duplicate newsletter"),
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

    const sendTestToTeam = trpc.adminNewsletter.sendTestToTeam.useMutation({
        onSuccess: (res) => {
            const r = res as { sent: number; failed: number; total: number };
            toast.success(
                r.failed > 0
                    ? `Test sent to ${r.sent}/${r.total} team members (${r.failed} failed)`
                    : `Test sent to ${r.sent} team member${r.sent === 1 ? "" : "s"}`
            );
        },
        onError: (err) => toast.error(err.message || "Failed to send team test"),
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
                                        {n.status === "sent" && (
                                            <Button size="sm" variant="outline" asChild title="View send analytics">
                                                <Link href={`/admin/newsletters/${n.id}`}>
                                                    <BarChart3 className="size-4" />
                                                    Analytics
                                                </Link>
                                            </Button>
                                        )}
                                        <PreviewNewsletterDialog newsletter={n} />
                                        {n.status !== "sent" && (
                                            <CopyPreviewLinkButton id={n.id} />
                                        )}
                                        <TestSendDialog
                                            newsletter={n}
                                            onSendTest={(to) => sendTest.mutateAsync({ id: n.id, to })}
                                            onSendTestToTeam={() => sendTestToTeam.mutateAsync({ id: n.id })}
                                        />
                                        <EditNewsletterDialog
                                            newsletter={n}
                                            onSave={(data) => update.mutate(data)}
                                            saving={update.isPending}
                                            onSaved={() => utils.adminNewsletter.list.invalidate()}
                                        />
                                        {n.status !== "sent" && (
                                            <ScheduleDialog
                                                newsletter={{ subject: n.subject, subjectB: n.subjectB ?? null, status: n.status, scheduledAt: n.scheduledAt, preheader: n.preheader ?? null, html: n.html }}
                                                onSchedule={(scheduledAt) =>
                                                    schedule.mutateAsync({ id: n.id, scheduledAt })
                                                }
                                            />
                                        )}
                                        {n.status !== "sent" && (
                                            <SendNewsletterDialog
                                                newsletter={{ id: n.id, subject: n.subject, subjectB: n.subjectB ?? null, preheader: n.preheader ?? null, html: n.html }}
                                                onSend={({ tag, cohort, nonOpenersOf }) => send.mutate({ id: n.id, tag, cohort, nonOpenersOf })}
                                                sending={send.isPending}
                                                error={send.error?.message}
                                                autoOpen={resendHandoff?.draftId === n.id}
                                                initialAudience={
                                                    resendHandoff?.draftId === n.id
                                                        ? `${NONOPENER_PREFIX}${resendHandoff.sourceId}`
                                                        : undefined
                                                }
                                                onAutoOpenConsumed={() => setResendHandoff(null)}
                                            />
                                        )}
                                        <DuplicateNewsletterDialog
                                            newsletter={{ id: n.id, subject: n.subject, subjectB: n.subjectB ?? null, publicationId: n.publicationId ?? null }}
                                            onDuplicate={(vars) => duplicate.mutate(vars)}
                                            duplicating={duplicate.isPending}
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
    newsletter: { subject: string; subjectB?: string | null; status: string; scheduledAt?: Date | string | null; preheader?: string | null; html: string };
    onSchedule: (scheduledAt: string | null) => Promise<unknown>;
}) {
    const [open, setOpen] = useState(false);
    const [value, setValue] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const isScheduled = newsletter.status === "scheduled";

    // Best-send-window hint: pull the audience's peak open window so the admin
    // can pick a high-engagement send time. Only fetch while the dialog is open.
    const { data: sendTime } = trpc.adminDashboard.sendTimeInsights.useQuery(
        undefined,
        { enabled: open, refetchOnWindowFocus: false }
    );

    // Scheduled sends target every confirmed subscriber (no per-issue segment is
    // persisted for a scheduled send), so preview the All audience so the admin
    // sees the resolved recipient count + A/B split before scheduling.
    const preview = trpc.adminNewsletter.audiencePreview.useQuery(
        { tag: null, cohort: null },
        { enabled: open, refetchOnWindowFocus: false }
    );

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

    // One-click "use recommended time": jump the picker to the NEXT future
    // occurrence of the audience's peak open day + window start, in the admin's
    // local wall-clock (matching the datetime-local input + the schedule cron).
    // We aim at the start of the peak 3-hour window so the send lands just as
    // engagement ramps. Always lands strictly in the future.
    const applyRecommendedTime = () => {
        if (!sendTime?.hasSignal) return;
        const { dayIndex, windowStart } = sendTime.recommendation;
        const now = new Date();
        const target = new Date(now);
        target.setHours(windowStart, 0, 0, 0);
        // Days until the recommended weekday (0 = today).
        let addDays = (dayIndex - now.getDay() + 7) % 7;
        // If it's today's weekday but the window has already passed, roll a week.
        if (addDays === 0 && target.getTime() <= now.getTime()) addDays = 7;
        target.setDate(target.getDate() + addDays);
        // Format back to a datetime-local value (local wall-clock, no tz suffix).
        const pad = (n: number) => String(n).padStart(2, "0");
        const local = `${target.getFullYear()}-${pad(target.getMonth() + 1)}-${pad(
            target.getDate()
        )}T${pad(target.getHours())}:${pad(target.getMinutes())}`;
        setValue(local);
        setError(null);
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
                {sendTime && sendTime.hasSignal && (
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <p className="text-xs text-muted-foreground">
                            💡 Readers open most on{" "}
                            <span className="font-medium text-foreground">
                                {sendTime.recommendation.day}s around{" "}
                                {sendTime.recommendation.windowLabel}
                            </span>
                            .
                        </p>
                        <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-6 px-2 text-xs"
                            onClick={applyRecommendedTime}
                        >
                            Use recommended time
                        </Button>
                    </div>
                )}
                <SendReadinessChecklist
                    subject={newsletter.subject}
                    preheader={newsletter.preheader}
                    html={newsletter.html}
                    recipientCount={preview.data?.count}
                    audienceLoading={preview.isFetching}
                />
                <ConfirmationSummary
                    subject={newsletter.subject}
                    subjectB={newsletter.subjectB}
                    audienceLabel="All confirmed subscribers"
                    count={preview.data?.count}
                    loading={preview.isFetching}
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

// One-click "Copy preview link" for a non-sent draft: mints a signed, expiring
// proof URL server-side (secret never leaves the server) and copies it to the
// clipboard so a reviewer can proof the issue on any device before send.
// Duplicate an issue into a fresh draft, optionally re-homing it into a
// different publication/stream. "Same as original" (the default) preserves the
// source's publication so the common case is one click; the picker only matters
// when spinning a past issue into another stream.
const SAME_AS_SOURCE = "__same__";
const PRIMARY_STREAM = "__primary__";

function DuplicateNewsletterDialog({
    newsletter,
    onDuplicate,
    duplicating,
}: {
    newsletter: { id: string; subject: string; subjectB: string | null; publicationId: string | null };
    onDuplicate: (vars: { id: string; publicationId?: string | null; abTest?: boolean }) => void;
    duplicating: boolean;
}) {
    const [open, setOpen] = useState(false);
    const [choice, setChoice] = useState<string>(SAME_AS_SOURCE);
    const [abTest, setAbTest] = useState(false);
    const pubs = trpc.adminPublications.list.useQuery(undefined, { enabled: open });

    const handleDuplicate = () => {
        // undefined => inherit source publication; null => primary/default
        // stream; a real id => that publication.
        let publicationId: string | null | undefined;
        if (choice === SAME_AS_SOURCE) publicationId = undefined;
        else if (choice === PRIMARY_STREAM) publicationId = null;
        else publicationId = choice;
        onDuplicate({ id: newsletter.id, publicationId, abTest: abTest || undefined });
        setOpen(false);
        setChoice(SAME_AS_SOURCE);
        setAbTest(false);
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant="outline" size="sm" title="Duplicate as a new draft">
                    <Copy className="size-4" />
                    Duplicate
                </Button>
            </DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Duplicate issue</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                        Creates a fresh <span className="font-medium text-foreground">draft</span> copy of
                        {" "}
                        <span className="font-medium text-foreground">{newsletter.subject}</span> with no
                        send state. Choose which publication it lands in.
                    </p>
                    <div className="space-y-1.5">
                        <label className="eyebrow text-xs">Publication</label>
                        <Select value={choice} onValueChange={setChoice}>
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value={SAME_AS_SOURCE}>Same as original</SelectItem>
                                <SelectItem value={PRIMARY_STREAM}>Primary / default stream</SelectItem>
                                {(pubs.data?.rows ?? [])
                                    .filter((p) => !p.isPrimary)
                                    .map((p) => (
                                        <SelectItem key={p.id} value={p.id}>
                                            {p.name}
                                        </SelectItem>
                                    ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="flex items-start justify-between gap-4 rounded-none border border-border p-3">
                        <div className="space-y-0.5">
                            <label htmlFor="dup-abtest" className="text-sm font-medium text-foreground">
                                Set up as an A/B subject test
                            </label>
                            <p className="text-xs text-muted-foreground">
                                Keeps Subject A, leaves Subject B blank for you to write a fresh variant.
                            </p>
                        </div>
                        <Switch id="dup-abtest" checked={abTest} onCheckedChange={setAbTest} />
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => setOpen(false)} disabled={duplicating}>
                        Cancel
                    </Button>
                    <Button onClick={handleDuplicate} disabled={duplicating}>
                        {duplicating ? "Duplicating…" : "Duplicate"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function CopyPreviewLinkButton({ id }: { id: string }) {
    const [copied, setCopied] = useState(false);
    const mint = trpc.adminNewsletter.previewLink.useMutation({
        onSuccess: async ({ url }) => {
            try {
                await navigator.clipboard.writeText(url);
                setCopied(true);
                toast.success("Preview link copied to clipboard");
                setTimeout(() => setCopied(false), 2000);
            } catch {
                // Clipboard blocked (e.g. insecure context) — surface the URL so
                // the reviewer can still copy it manually.
                toast.success("Preview link ready", { description: url, duration: 10000 });
            }
        },
        onError: (err) => toast.error(err.message || "Failed to create preview link"),
    });

    return (
        <Button
            size="sm"
            variant="outline"
            title="Copy a shareable proof link (expires in 14 days)"
            disabled={mint.isPending}
            onClick={() => mint.mutate({ id })}
        >
            {copied ? <Check className="size-4" /> : <Link2 className="size-4" />}
            Preview link
        </Button>
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
    onSendTestToTeam,
}: {
    newsletter: { subject: string };
    onSendTest: (to: string) => Promise<unknown>;
    onSendTestToTeam: () => Promise<unknown>;
}) {
    const [open, setOpen] = useState(false);
    const [to, setTo] = useState("");
    const [touched, setTouched] = useState(false);
    const [sending, setSending] = useState(false);
    const [result, setResult] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [lastTestedAt, setLastTestedAt] = useState<Date | null>(null);

    // Prefill the logged-in admin's own email so "send a test to myself" is
    // one click (Tier 11 #3). Only load once the dialog is opened.
    const me = trpc.adminNewsletter.whoami.useQuery(undefined, { enabled: open });
    const myEmail = me.data?.email ?? null;

    // Prefill the input with my email once it loads, unless the admin has
    // already typed something.
    useEffect(() => {
        if (open && myEmail && !touched && to === "") {
            setTo(myEmail);
        }
    }, [open, myEmail, touched, to]);

    const [sendingTeam, setSendingTeam] = useState(false);

    const doSend = async (address: string) => {
        setSending(true);
        setError(null);
        setResult(null);
        try {
            await onSendTest(address);
            setResult(`Test sent to ${address}`);
            setLastTestedAt(new Date());
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to send test");
        } finally {
            setSending(false);
        }
    };

    const doSendTeam = async () => {
        setSendingTeam(true);
        setError(null);
        setResult(null);
        try {
            const res = (await onSendTestToTeam()) as
                | { sent: number; failed: number; total: number }
                | undefined;
            if (res) {
                setResult(
                    res.failed > 0
                        ? `Test sent to ${res.sent}/${res.total} team members (${res.failed} failed)`
                        : `Test sent to ${res.sent} team member${res.sent === 1 ? "" : "s"}`
                );
            } else {
                setResult("Test sent to the team");
            }
            setLastTestedAt(new Date());
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to send team test");
        } finally {
            setSendingTeam(false);
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
                {myEmail && (
                    <Button
                        variant="secondary"
                        className="w-full"
                        disabled={sending || sendingTeam}
                        onClick={() => doSend(myEmail)}
                    >
                        <UserRound className="size-4" />
                        {sending ? "Sending…" : `Send test to me (${myEmail})`}
                    </Button>
                )}
                <Button
                    variant="outline"
                    className="w-full"
                    disabled={sending || sendingTeam}
                    onClick={doSendTeam}
                >
                    <Users className="size-4" />
                    {sendingTeam ? "Sending…" : "Send test to the whole team"}
                </Button>
                <p className="text-xs text-muted-foreground">
                    Sends a test copy to every owner, admin, and editor so the issue can be proofed by the whole team before a real send.
                </p>
                <Input
                    type="email"
                    placeholder="you@example.com"
                    value={to}
                    onChange={(e) => {
                        setTouched(true);
                        setTo(e.target.value);
                    }}
                />
                {lastTestedAt && !result && (
                    <p className="text-xs text-muted-foreground">
                        Last tested {lastTestedAt.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                    </p>
                )}
                {result && <p className="text-sm text-green-600 dark:text-green-400">{result}</p>}
                {error && <p className="text-sm text-destructive">{error}</p>}
                <DialogFooter>
                    <Button variant="secondary" onClick={() => setOpen(false)} disabled={sending || sendingTeam}>
                        Close
                    </Button>
                    <Button disabled={sending || sendingTeam || !to.includes("@")} onClick={() => doSend(to)}>
                        {sending ? "Sending…" : "Send test"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

const ALL_AUDIENCE = "__all__";
// Engagement-cohort win-back audiences (Tier 7 #2). Prefixed so they never
// collide with a tag value.
const COHORT_PREFIX = "__cohort__:";
const COHORT_ATRISK = `${COHORT_PREFIX}atRisk`;
const COHORT_DORMANT = `${COHORT_PREFIX}dormant`;

// Resend-to-non-openers audiences (Tier 17 #1). Prefixed with the source
// issue id so they never collide with a tag/cohort value.
const NONOPENER_PREFIX = "__nonopeners__:";

// A/B subject-line split: the send path splits the audience ~50/50 across the
// two subjects deterministically per subscriber. Preview that split for a total
// recipient count so the confirmation summary can show it before send.
function abSplitFor(total: number): { a: number; b: number } {
    const a = Math.ceil(total / 2);
    return { a, b: total - a };
}

// Shared confirmation-summary recap block used by both the Send and Schedule
// dialogs so an admin always sees subject + audience + resolved recipient count
// (+ A/B split) before committing an irreversible send.
function ConfirmationSummary({
    subject,
    subjectB,
    audienceLabel,
    count,
    loading,
}: {
    subject: string;
    subjectB?: string | null;
    audienceLabel: string;
    count?: number;
    loading?: boolean;
}) {
    const hasAb = !!subjectB?.trim();
    const split = typeof count === "number" && hasAb ? abSplitFor(count) : null;
    return (
        <div className="space-y-2 border border-border p-3 text-sm">
            <div className="eyebrow text-muted-foreground">Confirm send</div>
            <dl className="space-y-1.5">
                <div className="flex gap-2">
                    <dt className="w-24 shrink-0 text-muted-foreground">Subject</dt>
                    <dd className="min-w-0 flex-1 truncate font-medium text-foreground">{subject}</dd>
                </div>
                {hasAb && (
                    <div className="flex gap-2">
                        <dt className="w-24 shrink-0 text-muted-foreground">Subject B</dt>
                        <dd className="min-w-0 flex-1 truncate font-medium text-foreground">{subjectB}</dd>
                    </div>
                )}
                <div className="flex gap-2">
                    <dt className="w-24 shrink-0 text-muted-foreground">Audience</dt>
                    <dd className="min-w-0 flex-1 text-foreground">{audienceLabel}</dd>
                </div>
                <div className="flex gap-2">
                    <dt className="w-24 shrink-0 text-muted-foreground">Recipients</dt>
                    <dd className="min-w-0 flex-1 font-medium text-foreground">
                        {loading
                            ? "Resolving…"
                            : typeof count === "number"
                              ? `${count.toLocaleString()} subscriber${count === 1 ? "" : "s"}`
                              : "—"}
                    </dd>
                </div>
                {split && (
                    <div className="flex gap-2">
                        <dt className="w-24 shrink-0 text-muted-foreground">A/B split</dt>
                        <dd className="min-w-0 flex-1 text-foreground">
                            ~{split.a.toLocaleString()} get subject A · ~{split.b.toLocaleString()} get subject B
                        </dd>
                    </div>
                )}
            </dl>
        </div>
    );
}

function SendNewsletterDialog({
    newsletter,
    onSend,
    sending,
    error,
    autoOpen,
    initialAudience,
    onAutoOpenConsumed,
}: {
    newsletter: { id: string; subject: string; subjectB?: string | null; preheader?: string | null; html: string };
    onSend: (audience: {
        tag: string | null;
        cohort: "atRisk" | "dormant" | null;
        nonOpenersOf: string | null;
    }) => void;
    sending: boolean;
    error?: string;
    // One-click resend hand-off: when true, auto-open the dialog with
    // `initialAudience` pre-selected (e.g. non-openers of a source issue).
    autoOpen?: boolean;
    initialAudience?: string;
    onAutoOpenConsumed?: () => void;
}) {
    const [open, setOpen] = useState(false);
    // "__all__" = every confirmed subscriber; a "__cohort__:*" value = an
    // engagement cohort; a "__nonopeners__:<id>" value = resend to non-openers
    // of that sent issue; any other value = that tag/segment.
    const [audience, setAudience] = useState<string>(ALL_AUDIENCE);
    const isCohort = audience.startsWith(COHORT_PREFIX);
    const isNonOpeners = audience.startsWith(NONOPENER_PREFIX);
    const cohort = isCohort ? (audience.slice(COHORT_PREFIX.length) as "atRisk" | "dormant") : null;
    const nonOpenersOf = isNonOpeners ? audience.slice(NONOPENER_PREFIX.length) : null;
    const tag = isCohort || isNonOpeners || audience === ALL_AUDIENCE ? null : audience;

    // A pending pre-selected audience for a one-click resend hand-off. Set when
    // the dialog auto-opens; consumed by the reset effect so the open doesn't
    // clobber it back to "All".
    const pendingAudienceRef = useRef<string | null>(null);

    // Auto-open (once) when handed off from the analytics resend button, with
    // the non-openers audience pre-selected.
    useEffect(() => {
        if (autoOpen) {
            pendingAudienceRef.current = initialAudience ?? null;
            setOpen(true);
            onAutoOpenConsumed?.();
        }
        // Fire only on the auto-open signal.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [autoOpen]);

    // Reset the audience each time the dialog opens so it never carries a stale
    // tag from a previous issue — unless a resend hand-off pre-selected one.
    useEffect(() => {
        if (open) {
            setAudience(pendingAudienceRef.current ?? ALL_AUDIENCE);
            pendingAudienceRef.current = null;
        }
    }, [open]);

    // All tags currently in use (for the segment dropdown).
    const tagsQuery = trpc.adminSubscribers.listTags.useQuery(undefined, { enabled: open });
    // Cohort headline counts (so the dropdown can show the win-back segment sizes).
    const cohortCounts = trpc.adminSubscribers.engagementSummary.useQuery(
        {},
        { enabled: open },
    );
    // Recently-sent issues (with a non-opener count) the editor can resend to.
    const resendSources = trpc.adminNewsletter.sentIssuesForResend.useQuery(
        {},
        { enabled: open },
    );
    // Live count + sample of who will actually receive this issue.
    const preview = trpc.adminNewsletter.audiencePreview.useQuery(
        { tag, cohort, nonOpenersOf },
        { enabled: open }
    );

    const targetCount = preview.data?.count;
    const emptyTarget = targetCount === 0;

    // The subject of the source issue this resend targets non-openers of.
    const nonOpenerSource = nonOpenersOf
        ? resendSources.data?.find((s) => s.id === nonOpenersOf)
        : undefined;

    // Human-readable audience label for the confirmation recap.
    const audienceLabel = cohort
        ? `Win-back — ${cohort === "atRisk" ? "at-risk" : "dormant"} subscribers`
        : nonOpenersOf
          ? `Non-openers of “${nonOpenerSource?.subject ?? "a past issue"}”`
          : tag
            ? `Confirmed subscribers tagged “${tag}”`
            : "All confirmed subscribers";

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
                            <SelectItem value={COHORT_ATRISK}>
                                Win-back — at-risk{typeof cohortCounts.data?.atRisk === "number" ? ` (${cohortCounts.data.atRisk})` : ""}
                            </SelectItem>
                            <SelectItem value={COHORT_DORMANT}>
                                Win-back — dormant{typeof cohortCounts.data?.dormant === "number" ? ` (${cohortCounts.data.dormant})` : ""}
                            </SelectItem>
                            {resendSources.data && resendSources.data.length > 0 && (
                                <SelectGroup>
                                    <SelectLabel>Resend to non-openers of…</SelectLabel>
                                    {resendSources.data.map((s) => (
                                        <SelectItem
                                            key={s.id}
                                            value={`${NONOPENER_PREFIX}${s.id}`}
                                        >
                                            {s.subject} ({s.nonOpeners} didn&rsquo;t open)
                                        </SelectItem>
                                    ))}
                                </SelectGroup>
                            )}
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
                              ? `Will send to ${targetCount} confirmed subscriber${targetCount === 1 ? "" : "s"}${cohort ? ` in the ${cohort === "atRisk" ? "at-risk" : "dormant"} win-back segment` : nonOpenersOf ? " who didn\u2019t open the original" : tag ? ` tagged \u201c${tag}\u201d` : ""}.`
                              : ""}
                    </p>
                    {isCohort && (
                        <p className="text-xs text-muted-foreground">
                            {cohort === "dormant"
                                ? "Confirmed subscribers sent 2+ issues who have never opened one — a last nudge before churn."
                                : "Confirmed subscribers who used to open but have gone quiet for 60+ days."}
                        </p>
                    )}
                    {isNonOpeners && (
                        <p className="text-xs text-muted-foreground">
                            Subscribers who were delivered that issue but never opened it — and are still on the list. A good time to try a fresher subject line.
                        </p>
                    )}
                    {preview.data?.sample && preview.data.sample.length > 0 && (
                        <p className="text-xs text-muted-foreground truncate">
                            e.g. {preview.data.sample.map((s) => s.email).join(", ")}
                            {typeof targetCount === "number" && targetCount > preview.data.sample.length ? "…" : ""}
                        </p>
                    )}
                </div>

                <SendReadinessChecklist
                    subject={newsletter.subject}
                    preheader={newsletter.preheader}
                    html={newsletter.html}
                    recipientCount={targetCount}
                    audienceLoading={preview.isFetching}
                />

                <ConfirmationSummary
                    subject={newsletter.subject}
                    subjectB={newsletter.subjectB}
                    audienceLabel={audienceLabel}
                    count={targetCount}
                    loading={preview.isFetching}
                />

                {error && <p className="text-sm text-destructive">{error}</p>}
                <DialogFooter>
                    <Button variant="secondary" onClick={() => setOpen(false)} disabled={sending}>
                        Cancel
                    </Button>
                    <Button
                        disabled={sending || preview.isFetching || emptyTarget}
                        onClick={() => {
                            onSend({ tag, cohort, nonOpenersOf });
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
    onSaved,
}: {
    newsletter: {
        id: string;
        slug: string | null;
        subject: string;
        subjectB?: string | null;
        preheader: string | null;
        html: string;
        status: string;
        updatedAt?: Date | string | null;
    };
    onSave: (data: {
        id: string;
        subject: string;
        subjectB?: string | null;
        html: string;
        preheader?: string;
        status: NewsletterStatus;
        slug?: string;
    }) => void;
    saving: boolean;
    onSaved?: () => void;
}) {
    const [open, setOpen] = useState(false);
    const [subject, setSubject] = useState(newsletter.subject);
    const [subjectB, setSubjectB] = useState(newsletter.subjectB ?? "");
    const [slug, setSlug] = useState(newsletter.slug ?? "");
    const [preheader, setPreheader] = useState(newsletter.preheader ?? "");
    const [html, setHtml] = useState(newsletter.html);
    const [status, setStatus] = useState<NewsletterStatus>(newsletter.status as NewsletterStatus);
    const isSent = newsletter.status === "sent";
    // Autosave is only offered for drafts — a scheduled/sent issue must be
    // changed deliberately via the explicit Save button (and the server refuses
    // autosave on non-drafts anyway).
    const isDraft = newsletter.status === "draft";

    // Autosave state. `lastSaved` drives the "Saved HH:MM" label; `saveState`
    // shows the transient status. `expectedUpdatedAt` tracks the row version for
    // optimistic-concurrency so an autosave never clobbers a concurrent edit.
    const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
    const [lastSaved, setLastSaved] = useState<Date | null>(null);
    const [saveError, setSaveError] = useState<string | null>(null);
    const expectedUpdatedAtRef = useRef<string | undefined>(undefined);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    // Guard: don't autosave the initial hydrate (open resets the fields). Only
    // real user edits after the dialog is populated should trigger a save.
    const dirtyRef = useRef(false);

    const saveDraft = trpc.adminNewsletter.saveDraft.useMutation();

    // Recovery affordance (Tier 14 #5): the version the editor initialized with
    // for this open. On reopen we re-fetch the server row; if its `updatedAt` is
    // newer (a tab closed mid-edit, or a concurrent autosave elsewhere) we offer
    // a one-click "load latest" instead of silently showing stale content.
    const initializedAtRef = useRef<string | null>(null);
    const [recovery, setRecovery] = useState<{
        subject: string;
        subjectB: string | null;
        preheader: string | null;
        html: string;
        slug: string | null;
        updatedAt: string | null;
    } | null>(null);

    useEffect(() => {
        if (!open) return;
        setSubject(newsletter.subject);
        setSubjectB(newsletter.subjectB ?? "");
        setSlug(newsletter.slug ?? "");
        setPreheader(newsletter.preheader ?? "");
        setHtml(newsletter.html);
        setStatus(newsletter.status as NewsletterStatus);
        // Reset autosave bookkeeping for this open.
        setSaveState("idle");
        setLastSaved(null);
        setSaveError(null);
        setRecovery(null);
        dirtyRef.current = false;
        const initIso = newsletter.updatedAt
            ? new Date(newsletter.updatedAt).toISOString()
            : null;
        initializedAtRef.current = initIso;
        expectedUpdatedAtRef.current = initIso ?? undefined;
    }, [open, newsletter]);

    // On open, re-fetch the current server row. If the editor has NOT been
    // edited yet this open (dirtyRef false — so we won't clobber live typing)
    // and the server's updatedAt is newer than the version we initialized with,
    // stash it as a recoverable "latest" version and surface the banner.
    const freshQuery = trpc.adminNewsletter.getFresh.useQuery(
        { id: newsletter.id },
        { enabled: open, refetchOnWindowFocus: false, staleTime: 0 }
    );
    useEffect(() => {
        if (!open) return;
        const data = freshQuery.data;
        if (!data || !data.updatedAt) return;
        // Don't interrupt an in-progress edit in this tab.
        if (dirtyRef.current) return;
        const initIso = initializedAtRef.current;
        const serverTime = new Date(data.updatedAt).getTime();
        const initTime = initIso ? new Date(initIso).getTime() : 0;
        if (serverTime > initTime) {
            setRecovery({
                subject: data.subject,
                subjectB: data.subjectB ?? null,
                preheader: data.preheader ?? null,
                html: data.html,
                slug: data.slug ?? null,
                updatedAt: data.updatedAt,
            });
        } else {
            setRecovery(null);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [freshQuery.data, open]);

    // Load the newer server version into the editor and dismiss the banner.
    const loadLatest = useCallback(() => {
        if (!recovery) return;
        setSubject(recovery.subject);
        setSubjectB(recovery.subjectB ?? "");
        setPreheader(recovery.preheader ?? "");
        setHtml(recovery.html);
        if (recovery.slug) setSlug(recovery.slug);
        // The loaded content now matches the server version — sync bookkeeping so
        // it's not re-flagged and future autosaves use the right base version.
        initializedAtRef.current = recovery.updatedAt;
        expectedUpdatedAtRef.current = recovery.updatedAt ?? undefined;
        if (recovery.updatedAt) setLastSaved(new Date(recovery.updatedAt));
        dirtyRef.current = false;
        setRecovery(null);
        toast.success("Loaded the latest autosaved version");
    }, [recovery]);

    const runAutosave = useCallback(() => {
        saveDraft.mutate(
            {
                id: newsletter.id,
                subject: subject.trim() || undefined,
                subjectB: subjectB.trim() || null,
                html,
                preheader,
                expectedUpdatedAt: expectedUpdatedAtRef.current,
            },
            {
                onSuccess: (res) => {
                    expectedUpdatedAtRef.current = res.updatedAt;
                    setLastSaved(new Date(res.updatedAt));
                    setSaveState("saved");
                    setSaveError(null);
                    onSaved?.();
                },
                onError: (err) => {
                    setSaveState("error");
                    setSaveError(err.message || "Autosave failed");
                },
            }
        );
    }, [newsletter.id, subject, subjectB, html, preheader, saveDraft, onSaved]);

    // Debounced autosave: any draft-field change schedules a save ~1.2s later.
    useEffect(() => {
        if (!open || !isDraft) return;
        if (!dirtyRef.current) return;
        setSaveState("saving");
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => runAutosave(), 1200);
        return () => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [subject, subjectB, html, preheader, open, isDraft]);

    // Mark the form dirty on the first real edit so the hydrate effect above
    // doesn't immediately trigger an autosave.
    const markDirty = () => {
        dirtyRef.current = true;
        // The user is actively editing this tab — stop offering to overwrite
        // their work with the fetched "latest" version.
        if (recovery) setRecovery(null);
    };

    const savedLabel =
        saveState === "saving"
            ? "Saving\u2026"
            : saveState === "error"
              ? saveError || "Autosave failed"
              : lastSaved
                ? `Saved ${lastSaved.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}`
                : "";

    // Unsaved-changes guard (Tier 14 #2). Autosave only protects a DRAFT's
    // body/subject/subjectB/preheader — so a scheduled/sent issue can silently
    // drop edits if the dialog is dismissed (backdrop/Esc/X/Cancel) without
    // hitting Save. Compute whether the fields the explicit Save controls have
    // diverged from the loaded issue, scoped to what autosave doesn't cover, so
    // we only prompt when there's real unsaved work.
    const norm = (v: string | null | undefined) => (v ?? "").trim();
    const loadedSlug = newsletter.slug ?? "";
    // Slug is never autosaved (even for drafts), so it's always "unprotected".
    const slugDirty = norm(slug) !== norm(loadedSlug);
    // For non-draft issues autosave is off entirely, so every field is at risk.
    // For drafts, only the slug (and a status change) can be lost on close.
    const contentDirty =
        norm(subject) !== norm(newsletter.subject) ||
        norm(subjectB) !== norm(newsletter.subjectB) ||
        norm(preheader) !== norm(newsletter.preheader) ||
        html !== newsletter.html;
    const statusDirty = status !== (newsletter.status as NewsletterStatus);
    const hasUnsavedChanges = isDraft
        ? slugDirty || statusDirty
        : contentDirty || slugDirty || statusDirty;

    // Confirm before discarding unsaved changes on a close attempt. Never nag
    // when nothing changed.
    const attemptClose = () => {
        if (hasUnsavedChanges) {
            const ok = window.confirm(
                "Discard unsaved changes? Your edits to this issue haven't been saved."
            );
            if (!ok) return;
        }
        setOpen(false);
    };

    return (
        <Dialog
            open={open}
            onOpenChange={(next) => {
                if (next) {
                    setOpen(true);
                    return;
                }
                // Radix requested a close (backdrop / Esc / X). Route it through
                // the guard so unsaved changes get a confirm first.
                attemptClose();
            }}
        >
            <DialogTrigger asChild>
                <Button size="sm" variant="secondary">Edit</Button>
            </DialogTrigger>

            <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Edit newsletter</DialogTitle>
                    {isDraft && (
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            {saveState === "saving" && (
                                <span className="inline-block size-1.5 animate-pulse rounded-full bg-foreground/60" />
                            )}
                            {saveState === "saved" && (
                                <Check className="size-3 text-green-600 dark:text-green-400" />
                            )}
                            <span className={saveState === "error" ? "text-destructive" : undefined}>
                                {savedLabel || "Changes autosave as you edit"}
                            </span>
                        </div>
                    )}
                </DialogHeader>

                {recovery && (
                    <div className="flex flex-col gap-2 border border-border bg-muted/40 p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-start gap-2">
                            <RotateCcw className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                            <span className="text-muted-foreground">
                                A newer autosaved version exists
                                {recovery.updatedAt
                                    ? ` (saved ${new Date(recovery.updatedAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })})`
                                    : ""}
                                . You may be viewing an older copy.
                            </span>
                        </div>
                        <div className="flex shrink-0 gap-2">
                            <Button size="sm" variant="secondary" onClick={() => setRecovery(null)}>
                                Dismiss
                            </Button>
                            <Button size="sm" onClick={loadLatest}>
                                Load latest
                            </Button>
                        </div>
                    </div>
                )}

                <div className="space-y-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                            <div className="text-sm font-medium">Subject</div>
                            <Input
                                value={subject}
                                onChange={(e) => { markDirty(); setSubject(e.target.value); }}
                                placeholder="Subject line"
                            />
                            <SubjectMeter subject={subject} />
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
                        <div className="text-sm font-medium">
                            Subject B <span className="text-muted-foreground font-normal">(optional — A/B test)</span>
                        </div>
                        <Input
                            value={subjectB}
                            onChange={(e) => { markDirty(); setSubjectB(e.target.value); }}
                            placeholder="Alternate subject line to test against"
                            disabled={isSent}
                        />
                        {subjectB.trim() ? <SubjectMeter subject={subjectB} label="Subject B" /> : null}
                        {!isSent && subject.trim() && !subjectB.trim() ? (
                            <div className="space-y-1.5">
                                <div className="text-xs text-muted-foreground">Suggest a variant from Subject A:</div>
                                <div className="flex flex-wrap gap-2">
                                    {buildSubjectVariants(subject).map((v) => (
                                        <Button
                                            key={v.kind}
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            title={`${v.hint}: ${v.value}`}
                                            onClick={() => { markDirty(); setSubjectB(v.value); }}
                                        >
                                            {v.label}
                                        </Button>
                                    ))}
                                </div>
                            </div>
                        ) : null}
                        <p className="text-xs text-muted-foreground">
                            {isSent
                                ? "This issue has already been sent — the A/B split is locked in."
                                : subjectB.trim()
                                  ? "On send, the audience splits ~50/50 between Subject and Subject B. The winning variant shows in analytics after opens roll in."
                                  : "Leave blank for a single subject line. Add one to run an A/B subject-line test."}
                        </p>
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
                            onChange={(e) => { markDirty(); setPreheader(e.target.value); }}
                            placeholder="Short preview text shown in email clients"
                        />
                    </div>

                    <div className="space-y-2">
                        <div className="text-sm font-medium">Body</div>
                        <NewsletterRichEditor
                            value={html}
                            onChange={(v) => { markDirty(); setHtml(v); }}
                            placeholder="Write the email body"
                        />
                    </div>

                    <IssueLintPanel html={html} preheader={preheader} />

                    <div className="flex justify-end gap-2 pt-2">
                        <Button variant="secondary" onClick={attemptClose}>
                            Cancel
                        </Button>
                        <Button
                            disabled={saving || !subject.trim()}
                            onClick={() => {
                                onSave({
                                    id: newsletter.id,
                                    subject,
                                    subjectB: subjectB.trim() || null,
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
