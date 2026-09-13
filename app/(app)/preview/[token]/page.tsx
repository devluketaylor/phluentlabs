import { db } from "@/db/client";
import { newsletters } from "@/db/schemas/newsletters";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { Eye } from "lucide-react";
import type { Metadata } from "next";
import { verifyPreviewToken } from "@/lib/preview-token";

type Props = { params: Promise<{ token: string }> };

// A proof link is for reviewers only: never index it, and never let a search
// engine or the sitemap surface an unpublished draft.
export const metadata: Metadata = {
    title: "Draft preview",
    robots: { index: false, follow: false, nocache: true },
};

// Resolve a preview token to its draft. Returns null on any failure (bad/expired
// token, missing issue) so we can 404 without leaking whether a token was valid.
async function getPreviewIssue(token: string) {
    let newsletterId: string;
    try {
        const payload = await verifyPreviewToken(token);
        newsletterId = payload.newsletterId;
    } catch {
        return null;
    }

    const [issue] = await db
        .select()
        .from(newsletters)
        .where(eq(newsletters.id, newsletterId));

    return issue ?? null;
}

export default async function PreviewPage({ params }: Props) {
    const { token } = await params;
    const issue = await getPreviewIssue(token);

    if (!issue) notFound();

    // Reading time mirrors the public issue page (~220 wpm over the stripped text).
    const wordCount = issue.html.replace(/<[^>]*>/g, " ").split(/\s+/).filter(Boolean).length;
    const readingMinutes = Math.max(1, Math.round(wordCount / 220));

    const statusLabel = issue.status === "scheduled" ? "Scheduled" : "Draft";

    return (
        <div className="max-w-2xl mx-auto px-4 py-10 sm:px-6 sm:py-12">
            {/* Proof banner: makes it unmistakable this is an unsent preview, not
                a published issue. Monochrome, theme tokens (light+dark safe). */}
            <div className="mb-8 flex items-center gap-2.5 border border-border bg-muted px-4 py-3 text-sm">
                <Eye className="h-4 w-4 shrink-0 text-foreground" />
                <span className="text-foreground">
                    <span className="font-semibold">Preview</span>{" "}
                    <span className="text-muted-foreground">
                        &mdash; this is an unsent {statusLabel.toLowerCase()} issue for proofing. It hasn&rsquo;t been published or emailed to anyone.
                    </span>
                </span>
            </div>

            <article>
                <header className="mb-8 space-y-3">
                    <h1 className="text-2xl sm:text-3xl font-bold tracking-tight leading-tight">{issue.subject}</h1>
                    {issue.preheader && (
                        <p className="text-lg text-muted-foreground leading-relaxed">{issue.preheader}</p>
                    )}
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium capitalize">
                            {statusLabel}
                        </span>
                        <span aria-hidden>&middot;</span>
                        <span>{readingMinutes} min read</span>
                    </div>
                </header>

                <div
                    className="prose prose-base dark:prose-invert max-w-none prose-headings:tracking-tight prose-headings:font-semibold prose-a:text-primary prose-a:no-underline hover:prose-a:underline prose-img:rounded-xl prose-hr:border-border"
                    dangerouslySetInnerHTML={{ __html: issue.html }}
                />
            </article>
        </div>
    );
}
