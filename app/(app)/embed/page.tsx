import type { Metadata } from "next";
import { EmbedSnippet } from "./embed-snippet";

export const metadata: Metadata = {
    title: "Embed the subscribe form",
    description:
        "Grab a copy-paste snippet to embed the PhluentLabs subscribe form on any site.",
};

/**
 * Public self-service page explaining + generating the embeddable subscribe
 * widget snippet. Lives inside the (app) group so it gets the site chrome.
 */
export default function EmbedPage() {
    return (
        <main className="mx-auto max-w-2xl px-4 sm:px-6">
            <section className="space-y-3 py-10 sm:py-14">
                <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
                    Embed the subscribe form
                </h1>
                <p className="text-muted-foreground leading-relaxed">
                    Drop the PhluentLabs subscribe form onto any website with a single
                    copy-paste snippet. It works anywhere HTML does — blogs, docs,
                    landing pages — and new signups still flow into the same list with
                    referral attribution intact.
                </p>
            </section>

            <section className="rounded-2xl border bg-card p-5 shadow-sm sm:p-6">
                <EmbedSnippet />
            </section>

            <section className="text-muted-foreground space-y-2 py-10 text-sm">
                <h2 className="text-foreground font-semibold">How it works</h2>
                <p>
                    The snippet embeds <code>/embed/subscribe</code> in a lightweight
                    iframe. It respects light and dark mode, validates the email inline,
                    and shows a confirmation message once the reader subscribes — they
                    then get a confirmation email to complete signup.
                </p>
                <p>
                    Add <code>?ref=&lt;code&gt;</code> to credit a referrer, or{" "}
                    <code>?name=1</code> to also collect a first name.
                </p>
            </section>
        </main>
    );
}
