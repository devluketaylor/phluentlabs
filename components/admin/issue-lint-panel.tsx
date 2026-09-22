"use client";

import { useMemo } from "react";
import { AlertTriangle, CheckCircle2, Circle, Info } from "lucide-react";
import { lintIssue } from "@/lib/issue-lint";

/**
 * Read-only pre-send "quality" panel shown in the edit dialog. Analyzes the
 * current issue HTML + preheader (pure, client-side — no tRPC) and surfaces
 * word count, reading time, link/image counts, and a checklist of warnings
 * (empty body, missing preheader, dead links, images missing alt text).
 *
 * Deliberately does NOT flag "missing unsubscribe link" — the send layer
 * auto-injects it, so authoring it into the body isn't required.
 */
export function IssueLintPanel({
    html,
    preheader,
}: {
    html: string;
    preheader?: string | null;
}) {
    const result = useMemo(() => lintIssue({ html, preheader }), [html, preheader]);

    const warnings = result.issues.filter((i) => i.severity === "warn");
    const infos = result.issues.filter((i) => i.severity === "info");
    const clean = result.issues.length === 0;

    return (
        <div className="space-y-3 rounded-none border border-border p-3">
            <div className="flex items-center justify-between">
                <span className="eyebrow">Pre-send check</span>
                {clean ? (
                    <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                        <CheckCircle2 className="size-3.5" /> Looks good
                    </span>
                ) : (
                    <span className="text-xs text-muted-foreground">
                        {warnings.length > 0
                            ? `${warnings.length} to review`
                            : `${infos.length} suggestion${infos.length === 1 ? "" : "s"}`}
                    </span>
                )}
            </div>

            {/* Metrics row */}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Metric label="Words" value={result.wordCount.toLocaleString()} />
                <Metric label="Read time" value={`${result.readingMinutes} min`} />
                <Metric label="Links" value={String(result.linkCount)} />
                <Metric label="Images" value={String(result.imageCount)} />
            </div>

            {/* Checklist */}
            {result.issues.length > 0 && (
                <ul className="space-y-1.5">
                    {result.issues.map((issue) => (
                        <li key={issue.id} className="flex items-start gap-2 text-xs">
                            {issue.severity === "warn" ? (
                                <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
                            ) : (
                                <Info className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                            )}
                            <span
                                className={
                                    issue.severity === "warn"
                                        ? "text-foreground"
                                        : "text-muted-foreground"
                                }
                            >
                                {issue.message}
                            </span>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

type ReadinessCheck = {
    id: string;
    label: string;
    ok: boolean;
    /** When failing, a short reason shown after the label. */
    hint?: string;
};

/**
 * Compact pre-send "ready to send" checklist shown in the Send + Schedule
 * dialogs. Builds on the same pure `lintIssue` analysis plus the resolved
 * audience count so an issue never quietly goes out half-baked.
 *
 * Deliberately a SOFT gate: it surfaces what's off but never hard-blocks the
 * send button — the editor stays in control (product call, Tier 12).
 */
export function SendReadinessChecklist({
    subject,
    preheader,
    html,
    recipientCount,
    audienceLoading,
}: {
    subject: string;
    preheader?: string | null;
    html: string;
    recipientCount?: number;
    audienceLoading?: boolean;
}) {
    const lint = useMemo(() => lintIssue({ html, preheader }), [html, preheader]);

    const checks: ReadinessCheck[] = useMemo(() => {
        const subjectSet = subject.trim().length > 0;
        const bodyOk = lint.wordCount > 0;
        const preheaderSet = lint.hasPreheader;
        const linksOk = lint.emptyLinkCount === 0;
        // Audience is "ok" once resolved to > 0. While loading we treat it as
        // pending (neither pass nor fail) so it doesn't flash a false warning.
        const audienceResolved = typeof recipientCount === "number";
        const audienceOk = audienceResolved ? recipientCount! > 0 : false;

        return [
            { id: "subject", label: "Subject line set", ok: subjectSet, hint: "Add a subject before sending." },
            { id: "body", label: "Body has content", ok: bodyOk, hint: "The body is empty." },
            {
                id: "preheader",
                label: "Preheader set",
                ok: preheaderSet,
                hint: "Optional, but improves the inbox preview.",
            },
            {
                id: "links",
                label: "No dead links",
                ok: linksOk,
                hint:
                    lint.emptyLinkCount === 1
                        ? "1 link has no destination."
                        : `${lint.emptyLinkCount} links have no destination.`,
            },
            {
                id: "audience",
                label: "Audience resolved",
                ok: audienceOk,
                hint: audienceLoading
                    ? "Resolving recipients…"
                    : audienceResolved
                      ? "No one matches this audience."
                      : "Recipient count not resolved yet.",
            },
        ];
    }, [subject, lint, recipientCount, audienceLoading]);

    const failing = checks.filter((c) => !c.ok);
    const allReady = failing.length === 0;

    return (
        <div className="space-y-2 border border-border p-3 text-sm">
            <div className="flex items-center justify-between">
                <span className="eyebrow text-muted-foreground">Ready to send</span>
                {allReady ? (
                    <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                        <CheckCircle2 className="size-3.5" /> All checks pass
                    </span>
                ) : (
                    <span className="text-xs text-muted-foreground">
                        {failing.length} to review
                    </span>
                )}
            </div>
            <ul className="space-y-1.5">
                {checks.map((c) => {
                    const pending =
                        c.id === "audience" && audienceLoading && typeof recipientCount !== "number";
                    return (
                        <li key={c.id} className="flex items-start gap-2 text-xs">
                            {pending ? (
                                <Circle className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                            ) : c.ok ? (
                                <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-green-600 dark:text-green-400" />
                            ) : (
                                <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
                            )}
                            <span className={c.ok || pending ? "text-foreground" : "text-foreground"}>
                                {c.label}
                                {!c.ok && c.hint ? (
                                    <span className="text-muted-foreground"> — {c.hint}</span>
                                ) : null}
                            </span>
                        </li>
                    );
                })}
            </ul>
            {!allReady && (
                <p className="text-xs text-muted-foreground">
                    You can still send — this is a heads-up, not a hard block.
                </p>
            )}
        </div>
    );
}

function Metric({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-none border border-border p-2">
            <div className="eyebrow text-muted-foreground">{label}</div>
            <div className="mt-0.5 text-sm font-medium tabular-nums">{value}</div>
        </div>
    );
}
