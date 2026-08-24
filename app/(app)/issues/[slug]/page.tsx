import { db } from "@/db/client";
import { newsletters } from "@/db/schemas/newsletters";
import { and, eq, or } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";

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

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { slug } = await params;
    const issue = await getIssue(slug);

    if (!issue) return {};

    const description = issue.preheader ?? issue.subject;
    const canonical = `${APP_URL}/issues/${issue.slug}`;
    const published = (issue.sentAt ?? issue.createdAt)?.toISOString();
    const modified = (issue.updatedAt ?? issue.sentAt ?? issue.createdAt)?.toISOString();

    return {
        title: issue.subject,
        description,
        alternates: {
            canonical,
        },
        openGraph: {
            type: "article",
            title: issue.subject,
            description,
            url: canonical,
            siteName: "PhluentLabs",
            publishedTime: published,
            modifiedTime: modified,
            authors: [AUTHOR_NAME],
        },
        twitter: {
            card: "summary_large_image",
            title: issue.subject,
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
            </article>
        </div>
    );
}
