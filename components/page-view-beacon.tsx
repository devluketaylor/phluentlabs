"use client";

import { useEffect } from "react";

// Fires a single page-view beacon for a public issue page. Renders nothing.
// Debounced per slug within a browser session (sessionStorage) so a quick
// client remount / back-forward navigation doesn't double-count the same read.
export function PageViewBeacon({ slug }: { slug: string }) {
    useEffect(() => {
        if (!slug) return;
        const key = `pv:${slug}`;
        try {
            if (sessionStorage.getItem(key)) return;
            sessionStorage.setItem(key, "1");
        } catch {
            // sessionStorage unavailable (private mode / SSR edge) — still count once.
        }

        const controller = new AbortController();
        // Prefer keepalive fetch so the beacon survives navigation.
        fetch("/api/pv", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ slug }),
            keepalive: true,
            signal: controller.signal,
        }).catch(() => {
            // Analytics is best-effort — never surface an error to the reader.
        });

        return () => controller.abort();
    }, [slug]);

    return null;
}
