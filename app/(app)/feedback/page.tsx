import type { Metadata } from "next";
import { FeedbackForm } from "@/components/feedback-form";

export const metadata: Metadata = {
    title: "Send feedback",
    description: "Share a thought, correction, or reply about a PhluentLabs issue.",
    // Utility form — not something we want indexed or crawled as content.
    robots: { index: false, follow: false },
};

// Public, no-auth reader feedback page. Linked from the "just reply / share a
// note" prompt in the send footer (with ?issue=<slug>). Closes the loop that
// raw email replies to a broadcast currently drop.
export default function FeedbackPage() {
    return (
        <div className="mx-auto max-w-xl px-4 py-12 sm:px-6 sm:py-16">
            <div className="space-y-2 text-center">
                <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Send us a note</h1>
                <p className="text-sm text-muted-foreground sm:text-base">
                    Got a thought, a correction, or a reply to an issue? We read every one.
                </p>
            </div>
            <FeedbackForm />
        </div>
    );
}
