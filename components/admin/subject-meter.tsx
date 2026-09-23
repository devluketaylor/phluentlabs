"use client";

// Inline subject-line length meter. Shows a live character count and a
// mobile-inbox truncation heads-up so subjects are written to actually land
// in the inbox. Most mail clients truncate the visible subject around
// ~40-50 chars on mobile; desktop clients show more (~60-70). Pure
// client-side, no schema, monochrome/theme-token, light+dark safe.

const MOBILE_TRUNCATE = 45; // visible chars on typical mobile inbox lists
const DESKTOP_TRUNCATE = 65; // roomier desktop clients

export function SubjectMeter({ subject, label }: { subject: string; label?: string }) {
    const len = subject.trim().length;
    if (len === 0) return null;

    const overMobile = len > MOBILE_TRUNCATE;
    const overDesktop = len > DESKTOP_TRUNCATE;

    // A gentle status: within mobile budget = ok, over mobile = heads-up,
    // over desktop = it will be cut on nearly every client.
    const status: "ok" | "warn" | "over" = overDesktop ? "over" : overMobile ? "warn" : "ok";

    const barPct = Math.min(100, Math.round((len / DESKTOP_TRUNCATE) * 100));

    const statusText =
        status === "over"
            ? `Likely truncated on most clients — trim toward ${MOBILE_TRUNCATE} chars to be safe.`
            : status === "warn"
              ? `May be cut off on mobile (~${MOBILE_TRUNCATE} chars). Front-load the key words.`
              : `Good length — should show in full on mobile.`;

    const barColor =
        status === "over"
            ? "bg-destructive"
            : status === "warn"
              ? "bg-amber-500"
              : "bg-primary";

    return (
        <div className="space-y-1 px-1">
            <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">
                    {label ? `${label} · ` : ""}
                    <span className="tabular-nums text-foreground">{len}</span> chars
                </span>
                <span
                    className={
                        status === "over"
                            ? "text-destructive"
                            : status === "warn"
                              ? "text-amber-600 dark:text-amber-500"
                              : "text-muted-foreground"
                    }
                >
                    {statusText}
                </span>
            </div>
            <div className="h-1 w-full overflow-hidden rounded-none bg-muted">
                <div
                    className={`h-full ${barColor} transition-all`}
                    style={{ width: `${barPct}%` }}
                    aria-hidden
                />
            </div>
        </div>
    );
}
