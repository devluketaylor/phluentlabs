"use client";

// Inbox-line preview. Shows how the sender + subject + preheader will render
// in the inbox list of common mail clients, truncated at each client's typical
// visible width, so the subject AND preheader are authored deliberately (a
// well-written preheader is prime real estate most editors leave blank).
//
// Truncation widths are approximate character budgets for the collapsed inbox
// list row (not the open message). They vary by device/zoom/font, so these are
// sensible mid-range defaults, not pixel-exact. Pure client-side, no schema,
// monochrome/theme-token, light+dark safe.

const SENDER = "phluent labs";

type Client = {
    key: string;
    label: string;
    // How many chars of the SUBJECT typically show before truncation, and how
    // many chars of the PREHEADER show after it on that client's inbox row.
    subjectChars: number;
    preheaderChars: number;
};

// Ordered narrowest → roomiest so the tightest constraint reads first.
const CLIENTS: Client[] = [
    { key: "gmail-mobile", label: "Gmail (mobile)", subjectChars: 38, preheaderChars: 40 },
    { key: "apple-mail", label: "Apple Mail (iPhone)", subjectChars: 35, preheaderChars: 50 },
    { key: "outlook", label: "Outlook (desktop)", subjectChars: 62, preheaderChars: 55 },
    { key: "gmail-desktop", label: "Gmail (desktop)", subjectChars: 70, preheaderChars: 90 },
];

function truncate(text: string, max: number): { shown: string; cut: boolean } {
    const t = text.trim();
    if (t.length <= max) return { shown: t, cut: false };
    // Trim to max, then back off to the last word boundary if we can, so the
    // preview reads naturally instead of slicing mid-word.
    let end = max;
    const slice = t.slice(0, max);
    const lastSpace = slice.lastIndexOf(" ");
    if (lastSpace > max * 0.6) end = lastSpace;
    return { shown: t.slice(0, end).trimEnd(), cut: true };
}

export function InboxPreview({
    subject,
    preheader,
}: {
    subject: string;
    preheader?: string | null;
}) {
    const subj = subject.trim();
    if (!subj) return null;

    const pre = (preheader ?? "").trim();
    const hasPreheader = pre.length > 0;

    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between">
                <div className="text-xs font-medium text-muted-foreground">
                    Inbox preview
                </div>
                {!hasPreheader ? (
                    <div className="text-xs text-amber-600 dark:text-amber-500">
                        No preheader — clients will pull the first line of your body instead.
                    </div>
                ) : null}
            </div>
            <div className="divide-y divide-border border border-border">
                {CLIENTS.map((c) => {
                    const s = truncate(subj, c.subjectChars);
                    const p = hasPreheader
                        ? truncate(pre, c.preheaderChars)
                        : { shown: "", cut: false };
                    return (
                        <div key={c.key} className="space-y-1 px-3 py-2">
                            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                                {c.label}
                            </div>
                            <div className="flex items-baseline justify-between gap-2">
                                <span className="truncate text-sm font-semibold text-foreground">
                                    {SENDER}
                                </span>
                            </div>
                            <div className="text-sm leading-snug">
                                <span className="text-foreground">
                                    {s.shown}
                                    {s.cut ? (
                                        <span className="text-muted-foreground">…</span>
                                    ) : null}
                                </span>
                                {hasPreheader ? (
                                    <>
                                        {"  "}
                                        <span className="text-muted-foreground">
                                            {"— "}
                                            {p.shown}
                                            {p.cut ? "…" : ""}
                                        </span>
                                    </>
                                ) : null}
                            </div>
                        </div>
                    );
                })}
            </div>
            <p className="text-[11px] text-muted-foreground px-1">
                Approximate — real widths vary by device, font size, and zoom. Front-load
                the key words in both the subject and the preheader.
            </p>
        </div>
    );
}
