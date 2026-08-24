"use client";

import { useState } from "react";
import { FaXTwitter, FaLinkedin, FaLink, FaCheck } from "react-icons/fa6";

/**
 * Social share row for a public issue. Server passes the absolute URL + title
 * so we don't depend on window during SSR.
 */
export function IssueShare({ url, title }: { url: string; title: string }) {
    const [copied, setCopied] = useState(false);

    const encodedUrl = encodeURIComponent(url);
    const encodedTitle = encodeURIComponent(title);

    const twitter = `https://twitter.com/intent/tweet?url=${encodedUrl}&text=${encodedTitle}`;
    const linkedin = `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`;

    const copyLink = async () => {
        try {
            await navigator.clipboard.writeText(url);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            // Clipboard can fail (permissions / insecure context) — fail quietly.
        }
    };

    const linkClass =
        "inline-flex h-9 w-9 items-center justify-center rounded-full border text-muted-foreground transition-colors hover:text-foreground hover:bg-muted";

    return (
        <div className="mt-10 flex items-center gap-3 border-t pt-6">
            <span className="text-sm text-muted-foreground">Share this issue</span>
            <div className="flex items-center gap-2">
                <a
                    href={twitter}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={linkClass}
                    aria-label="Share on X"
                >
                    <FaXTwitter className="h-4 w-4" />
                </a>
                <a
                    href={linkedin}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={linkClass}
                    aria-label="Share on LinkedIn"
                >
                    <FaLinkedin className="h-4 w-4" />
                </a>
                <button
                    type="button"
                    onClick={copyLink}
                    className={linkClass}
                    aria-label="Copy link"
                >
                    {copied ? <FaCheck className="h-4 w-4 text-green-500" /> : <FaLink className="h-4 w-4" />}
                </button>
            </div>
        </div>
    );
}
