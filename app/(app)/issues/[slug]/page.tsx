import { db } from "@/db/client";
import { newsletters } from "@/db/schemas/newsletters";
import { and, asc, desc, eq, gt, lt, or } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import { IssueShare } from "@/components/issue-share";
import { IssueSubscribeCta } from "@/components/issue-subscribe-cta";

type Props = { params: Promise<{ slug: string }> };

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://phluentlabs.com";
const AUTHOR_NAME = "Luke Taylor";
const TWITTER_HANDLE = "@luketaylordev";

async function getIssue(slug: string) {
    // Only ever serve PUBLISHED issues publicly. Drafts must not be reachable
    // by slug/id — that would leak unpublished content and let search engines
    // index it.
    const [issue] = await db
        .select()
        .from(newsletters)
        .where(
            and(
                or(eq(newsletters.slug, slug), eq(newsletters.id, slug)),
                eq(newsletters.status, "sent"),
            ),
        );
    return issue ?? null;
}

// Previous = the published issue sent just BEFORE this one; next = just AFTER.
// Falls back to createdAt when sentAt is missing on older rows.
async function getAdjacentIssues(current: { sentAt: Date | null; createdAt: Date }) {
    const anchor = current.sentAt ?? current.createdAt;
    try {
        const [prev] = await db
            .select({ slug: newsletters.slug, subject: newsletters.subject })
            .from(newsletters)
            .where(and(eq(newsletters.status, "sent"), lt(newsletters.sentAt, anchor)))
            .orderBy(desc(newsletters.sentAt))
            .limit(1);

        const [next] = await db
            .select({ slug: newsletters.slug, subject: newsletters.subject })
            .from(newsletters)
            .where(and(eq(newsletters.status, "sent"), gt(newsletters.sentAt, anchor)))
            .orderBy(asc(newsletters.sentAt))
            .limit(1);

        return { prev: prev ?? null, next: next ?? null };
    } catch {
        return { prev: null, next: null };
    }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { slug } = await params;
    const issue = await getIssue(slug);

    if (!issue) return {};

    // Prefer explicit SEO fields when set, else fall back to email subject/preheader.
    const seoTitle = issue.seoTitle ?? issue.subject;
    const description = issue.metaDescription ?? issue.preheader ?? issue.subject;
    const canonical = `${APP_URL}/issues/${issue.slug}`;
    const published = (issue.sentAt ?? issue.createdAt)?.toISOString();
    const modified = (issue.updatedAt ?? issue.sentAt ?? issue.createdAt)?.toISOString();

    return {
        title: seoTitle,
        description,
        alternates: {
            canonical,
        },
        openGraph: {
            type: "article",
            title: seoTitle,
            description,
            url: canonical,
            siteName: "PhluentLabs",
            publishedTime: published,
            modifiedTime: modified,
            authors: [AUTHOR_NAME],
        },
        twitter: {
            card: "summary_large_image",
            title: seoTitle,
            description,
            creator: TWITTER_HANDLE,
        },
    };
}

export default async function IssuePage({ params }: Props) {
    const { slug } = await params;

    const issue = await getIssue(slug);

    if (!issue) notFound();

    const canonical = `${APP_URL}/issues/${issue.slug}`;
    const published = (issue.sentAt ?? issue.createdAt)?.toISOString();
    const modified = (issue.updatedAt ?? issue.sentAt ?? issue.createdAt)?.toISOString();

    // JSON-LD structured data — helps search engines understand this is an
    // article with an author and publish date, which can enable richer results.
    const jsonLd = {
        "@context": "https://schema.org",
        "@type": "Article",
        headline: issue.subject,
        description: issue.preheader ?? issue.subject,
        datePublished: published,
        dateModified: modified,
        author: {
            "@type": "Person",
            name: AUTHOR_NAME,
            url: "https://x.com/luketaylordev",
        },
        publisher: {
            "@type": "Organization",
            name: "PhluentLabs",
            url: APP_URL,
        },
        mainEntityOfPage: {
            "@type": "WebPage",
            "@id": canonical,
        },
        url: canonical,
    };

    return (
        <div className="max-w-2xl mx-auto px-6 py-12">
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
            />

            <Link
                href="/"
                className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-8"
            >
                <ArrowLeft className="w-4 h-4" />
                All issues
            </Link>

            <article>
                <header className="mb-8 space-y-2">
                    <h1 className="text-2xl font-bold">{issue.subject}</h1>
                    {issue.preheader && (
                        <p className="text-muted-foreground">{issue.preheader}</p>
                    )}
                    <p className="text-sm text-muted-foreground">
                        <time dateTime={published}>
                            {new Date(issue.sentAt ?? issue.createdAt).toLocaleDateString(undefined, {
                                year: "numeric",
                                month: "long",
                                day: "numeric",
                            })}
                        </time>
                    </p>
                </header>

                <div
                    className="prose prose-sm dark:prose-invert max-w-none"
                    dangerouslySetInnerHTML={{ __html: issue.html }}
                />

                <IssueShare url={canonical} title={issue.subject} />
            </article>

            <IssueNav slug={issue.slug} sentAt={issue.sentAt} createdAt={issue.createdAt} />

            <IssueSubscribeCta />
        </div>
    );
}

async function IssueNav({
    sentAt,
    createdAt,
}: {
    slug: string | null;
    sentAt: Date | null;
    createdAt: Date;
}) {
    const { prev, next } = await getAdjacentIssues({ sentAt, createdAt });
    if (!prev && !next) return null;

    return (
        <nav className="mt-12 grid grid-cols-1 gap-3 border-t pt-8 sm:grid-cols-2">
            {prev ? (
                <Link
                    href={`/issues/${prev.slug}`}
                    className="group flex flex-col gap-1 rounded-xl border p-4 transition-colors hover:bg-muted/50 sm:text-left"
                >
                    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                        <ArrowLeft className="h-3.5 w-3.5" /> Previous issue
                    </span>
                    <span className="text-sm font-medium group-hover:text-primary transition-colors line-clamp-2">
                        {prev.subject}
                    </span>
                </Link>
            ) : (
                <span aria-hidden className="hidden sm:block" />
            )}

            {next && (
                <Link
                    href={`/issues/${next.slug}`}
                    className="group flex flex-col gap-1 rounded-xl border p-4 transition-colors hover:bg-muted/50 sm:items-end sm:text-right"
                >
                    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                        Next issue <ArrowRight className="h-3.5 w-3.5" />
                    </span>
                    <span className="text-sm font-medium group-hover:text-primary transition-colors line-clamp-2">
                        {next.subject}
                    </span>
                </Link>
            )}
        </nav>
    );
}
