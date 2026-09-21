"use client";

import { useEffect, useState } from "react";

/**
 * Slim scroll-driven reading-progress bar fixed to the very top of the viewport.
 * Monochrome (`bg-foreground` → theme-token, light+dark safe, no retired coral).
 * Respects `prefers-reduced-motion`: when reduced motion is requested we drop the
 * width transition so the bar snaps instead of animating.
 *
 * Progress is measured against the full scrollable document height rather than a
 * specific article node so it stays simple + dependency-free; on a reading page
 * the article dominates the page height, which is the intent.
 */
export function ReadingProgress() {
    const [progress, setProgress] = useState(0);
    const [reduceMotion, setReduceMotion] = useState(false);

    useEffect(() => {
        const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
        const applyMq = () => setReduceMotion(mq.matches);
        applyMq();
        mq.addEventListener("change", applyMq);

        let raf = 0;
        const update = () => {
            raf = 0;
            const doc = document.documentElement;
            const scrollable = doc.scrollHeight - doc.clientHeight;
            const pct = scrollable > 0 ? (doc.scrollTop / scrollable) * 100 : 0;
            setProgress(Math.min(100, Math.max(0, pct)));
        };
        const onScroll = () => {
            // Coalesce scroll events into a single rAF for smoothness.
            if (raf === 0) raf = requestAnimationFrame(update);
        };

        update();
        window.addEventListener("scroll", onScroll, { passive: true });
        window.addEventListener("resize", onScroll, { passive: true });

        return () => {
            mq.removeEventListener("change", applyMq);
            window.removeEventListener("scroll", onScroll);
            window.removeEventListener("resize", onScroll);
            if (raf) cancelAnimationFrame(raf);
        };
    }, []);

    return (
        <div
            aria-hidden
            className="fixed inset-x-0 top-0 z-50 h-0.5 bg-transparent"
        >
            <div
                className="h-full bg-foreground"
                style={{
                    width: `${progress}%`,
                    transition: reduceMotion ? "none" : "width 75ms linear",
                }}
            />
        </div>
    );
}
