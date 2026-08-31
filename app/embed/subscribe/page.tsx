import * as React from "react";
import type { Metadata } from "next";
import { SubscribeWidget } from "./subscribe-widget";

// This route is designed to be dropped into an <iframe> on external sites, so
// keep it out of search results and let the host page frame it.
export const metadata: Metadata = {
    title: "Subscribe",
    robots: { index: false, follow: false },
};

/**
 * Standalone, embeddable subscribe page. Rendered OUTSIDE the (app) route group
 * on purpose — no navbar/footer chrome — so it sits cleanly inside an iframe.
 * The transparent-friendly padding keeps it looking good on any host bg.
 */
export default function EmbedSubscribePage() {
    return (
        <main className="mx-auto max-w-md p-4">
            <React.Suspense fallback={null}>
                <SubscribeWidget />
            </React.Suspense>
        </main>
    );
}
