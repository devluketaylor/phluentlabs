"use client";

import { FormHeader } from "@/components/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { trpc } from "@/trpc/client";
import { User, ArrowLeft, Mail, CheckCircle2, XCircle, Clock, Gift, Users } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";

function formatDateTime(d: Date | string | null | undefined) {
    if (!d) return "—";
    const date = typeof d === "string" ? new Date(d) : d;
    return date.toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
    });
}

function StatusBadge({ status }: { status: string }) {
    // Coral accent is safe in both themes; other states lean on themed
    // muted/border colors so light + dark both read correctly.
    const map: Record<string, string> = {
        subscribed: "border-[#ff5c5c] text-[#ff5c5c]",
        pending: "border-muted-foreground/40 text-muted-foreground",
        unsubscribed: "border-muted-foreground/40 text-muted-foreground line-through",
        sent: "border-[#ff5c5c] text-[#ff5c5c]",
        failed: "border-destructive/50 text-destructive",
        queued: "border-muted-foreground/40 text-muted-foreground",
    };
    const cls = map[status] ?? "border-muted-foreground/40 text-muted-foreground";
    return (
        <span
            className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium capitalize ${cls}`}
        >
            {status}
        </span>
    );
}

export default function SubscriberDetailPage() {
    const params = useParams<{ id: string }>();
    const id = params.id;

    const { data, isLoading, isError, error, refetch, isFetching } =
        trpc.adminSubscribers.getDetail.useQuery(
            { id },
            { refetchOnWindowFocus: false, retry: false }
        );

    const s = data?.subscriber;
    const fullName = s
        ? [s.firstName, s.lastName].filter(Boolean).join(" ") || null
        : null;

    return (
        <div className="max-w-4xl mx-auto pt-8 pb-16 px-4 space-y-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <FormHeader
                    icon={<User />}
                    title="Subscriber detail"
                    description="Signup, confirm/unsub history, and issues received."
                />
                <div className="flex items-center gap-2 self-start sm:self-auto">
                    <Button variant="secondary" asChild>
                        <Link href="/admin/subscribers">
                            <ArrowLeft className="size-4" />
                            Back
                        </Link>
                    </Button>
                    <Button
                        variant="secondary"
                        onClick={() => refetch()}
                        disabled={isFetching}
                    >
                        {isFetching ? "Refreshing…" : "Refresh"}
                    </Button>
                </div>
            </div>

            {isError && (
                <Card>
                    <CardContent className="text-sm text-destructive">
                        {error?.message ?? "Failed to load subscriber."}
                    </CardContent>
                </Card>
            )}

            {/* Profile + lifecycle */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                        <Mail className="size-4 text-primary" />
                        {isLoading || !s ? (
                            <Skeleton className="h-5 w-48" />
                        ) : (
                            <span className="truncate">{s.email}</span>
                        )}
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    {isLoading || !s ? (
                        <div className="space-y-2">
                            <Skeleton className="h-4 w-40" />
                            <Skeleton className="h-4 w-56" />
                            <Skeleton className="h-4 w-52" />
                        </div>
                    ) : (
                        <>
                            <div className="flex flex-wrap items-center gap-3">
                                <StatusBadge status={s.status} />
                                <span className="text-sm text-muted-foreground">
                                    {fullName ?? "No name on file"}
                                </span>
                            </div>

                            <div className="grid gap-3 sm:grid-cols-3">
                                <div className="rounded-md border p-3">
                                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                        <Clock className="size-3.5" />
                                        Signed up
                                    </div>
                                    <p className="mt-1 text-sm font-medium">
                                        {formatDateTime(s.createdAt)}
                                    </p>
                                </div>
                                <div className="rounded-md border p-3">
                                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                        <CheckCircle2 className="size-3.5" />
                                        Confirmed
                                    </div>
                                    <p className="mt-1 text-sm font-medium">
                                        {s.confirmedAt ? formatDateTime(s.confirmedAt) : "Not confirmed"}
                                    </p>
                                </div>
                                <div className="rounded-md border p-3">
                                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                        <XCircle className="size-3.5" />
                                        Unsubscribed
                                    </div>
                                    <p className="mt-1 text-sm font-medium">
                                        {s.unsubscribedAt
                                            ? formatDateTime(s.unsubscribedAt)
                                            : "—"}
                                    </p>
                                </div>
                            </div>

                            {s.updatedAt && (
                                <p className="text-xs text-muted-foreground">
                                    Last updated {formatDateTime(s.updatedAt)}
                                </p>
                            )}
                        </>
                    )}
                </CardContent>
            </Card>

            {/* Referral program */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                        <Gift className="size-4 text-primary" />
                        Referrals
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    {isLoading || !s ? (
                        <div className="space-y-2">
                            <Skeleton className="h-4 w-40" />
                            <Skeleton className="h-4 w-56" />
                        </div>
                    ) : (
                        <div className="grid gap-3 sm:grid-cols-3">
                            <div className="rounded-md border p-3">
                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                    <Users className="size-3.5" />
                                    Referred signups
                                </div>
                                <p className="mt-1 text-sm font-medium">
                                    {data?.referralCount ?? 0}
                                </p>
                            </div>
                            <div className="rounded-md border p-3">
                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                    <Gift className="size-3.5" />
                                    Referral code
                                </div>
                                <p className="mt-1 text-sm font-medium font-mono">
                                    {s.referralCode ?? "—"}
                                </p>
                            </div>
                            <div className="rounded-md border p-3">
                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                    <User className="size-3.5" />
                                    Referred by
                                </div>
                                <p className="mt-1 text-sm font-medium truncate">
                                    {data?.referredByEmail ?? "—"}
                                </p>
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Issues received */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">
                        Issues received
                        {data ? ` (${data.issuesCount})` : ""}
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <div className="space-y-2">
                            <Skeleton className="h-5 w-full" />
                            <Skeleton className="h-5 w-full" />
                        </div>
                    ) : !data || data.issues.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                            This subscriber hasn&apos;t been sent any issues yet.
                        </p>
                    ) : (
                        <ul className="divide-y">
                            {data.issues.map((issue) => (
                                <li
                                    key={issue.recipientId}
                                    className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between"
                                >
                                    <div className="min-w-0">
                                        {issue.slug ? (
                                            <Link
                                                href={`/issues/${issue.slug}`}
                                                className="font-medium hover:text-[#ff5c5c]"
                                            >
                                                {issue.subject}
                                            </Link>
                                        ) : (
                                            <span className="font-medium">{issue.subject}</span>
                                        )}
                                        {issue.error && (
                                            <p className="truncate text-xs text-destructive">
                                                {issue.error}
                                            </p>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-3 text-sm text-muted-foreground">
                                        <span>{formatDateTime(issue.sentAt ?? issue.createdAt)}</span>
                                        <StatusBadge status={issue.deliveryStatus} />
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
