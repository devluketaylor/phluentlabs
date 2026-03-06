import { db } from "@/db/client";
import { newsletters } from "@/db/schemas/newsletters";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { slug } = await params;
    const [issue] = await db
        .select({ subject: newsletters.subject, preheader: newsletters.preheader })
        .from(newsletters)
        .where(eq(newsletters.slug, slug));

    if (!issue) return {};

    return {
        title: `${issue.subject} | PhluentLabs`,
        description: issue.preheader ?? issue.subject,
        openGraph: {
            title: issue.subject,
            description: issue.preheader ?? issue.subject,
        },
    };
}

export default async function IssuePage({ params }: Props) {
    const { slug } = await params;

    const [issue] = await db
        .select()
        .from(newsletters)
        .where(eq(newsletters.slug, slug));

    if (!issue) notFound();

    return (
        <div className="max-w-2xl mx-auto px-6 py-12">
            <Link
                href="/"
                className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-8"
            >
                <ArrowLeft className="w-4 h-4" />
                All issues
            </Link>

            <header className="mb-8 space-y-2">
                <h1 className="text-2xl font-bold">{issue.subject}</h1>
                {issue.preheader && (
                    <p className="text-muted-foreground">{issue.preheader}</p>
                )}
                <p className="text-sm text-muted-foreground">
                    {new Date(issue.createdAt).toLocaleDateString(undefined, {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                    })}
                </p>
            </header>

            <div
                className="prose prose-sm dark:prose-invert max-w-none"
                dangerouslySetInnerHTML={{ __html: issue.html }}
            />
        </div>
    );
}
