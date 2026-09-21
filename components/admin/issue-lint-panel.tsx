"use client";

import { useMemo } from "react";
import { AlertTriangle, CheckCircle2, Info } from "lucide-react";
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

function Metric({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-none border border-border p-2">
            <div className="eyebrow text-muted-foreground">{label}</div>
            <div className="mt-0.5 text-sm font-medium tabular-nums">{value}</div>
        </div>
    );
}
