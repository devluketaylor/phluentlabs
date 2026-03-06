import { db } from "@/db/client";
import { newsletters } from "@/db/schemas/newsletters";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default async function IssuePage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;

    const [issue] = await db
        .select()
        .from(newsletters)
        .where(eq(newsletters.id, id));

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
