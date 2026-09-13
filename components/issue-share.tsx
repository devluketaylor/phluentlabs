"use client";

import { useState } from "react";
import { FaXTwitter, FaLinkedin, FaLink, FaCheck } from "react-icons/fa6";

/**
 * Prominent social share row for a public issue. Server passes the absolute URL
 * + title (so we don't depend on window during SSR) and the slug (so share taps
 * can be counted via the /api/share beacon — no PII, just a per-issue + channel
 * counter for admin analytics).
 */
export function IssueShare({
    url,
    title,
    slug,
}: {
    url: string;
    title: string;
    slug?: string;
}) {
    const [copied, setCopied] = useState(false);

    const encodedUrl = encodeURIComponent(url);
    const encodedTitle = encodeURIComponent(title);

    const twitter = `https://twitter.com/intent/tweet?url=${encodedUrl}&text=${encodedTitle}`;
    const linkedin = `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`;

    // Fire-and-forget share beacon — best-effort, never blocks or surfaces errors.
    const recordShare = (platform: "x" | "linkedin" | "copy") => {
        if (!slug) return;
        try {
            fetch("/api/share", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ slug, platform }),
                keepalive: true,
            }).catch(() => {});
        } catch {
            // ignore — analytics must never break sharing
        }
    };

    const copyLink = async () => {
        recordShare("copy");
        try {
            await navigator.clipboard.writeText(url);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            // Clipboard can fail (permissions / insecure context) — fail quietly.
        }
    };

    const btnClass =
        "inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground hover:border-foreground/40 hover:bg-muted";

    return (
        <div className="mt-10 flex flex-col gap-3 border-t pt-6 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-sm font-medium text-foreground">
                Enjoyed this? Share it
            </span>
            <div className="flex flex-wrap items-center gap-2">
                <a
                    href={twitter}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={btnClass}
                    aria-label="Share on X"
                    onClick={() => recordShare("x")}
                >
                    <FaXTwitter className="h-4 w-4" />
                    <span>X</span>
                </a>
                <a
                    href={linkedin}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={btnClass}
                    aria-label="Share on LinkedIn"
                    onClick={() => recordShare("linkedin")}
                >
                    <FaLinkedin className="h-4 w-4" />
                    <span>LinkedIn</span>
                </a>
                <button
                    type="button"
                    onClick={copyLink}
                    className={btnClass}
                    aria-label="Copy link"
                >
                    {copied ? (
                        <>
                            <FaCheck className="h-4 w-4 text-green-500" />
                            <span>Copied!</span>
                        </>
                    ) : (
                        <>
                            <FaLink className="h-4 w-4" />
                            <span>Copy link</span>
                        </>
                    )}
                </button>
            </div>
        </div>
    );
}
