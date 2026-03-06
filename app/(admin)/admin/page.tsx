"use client";

import { useState } from "react";
import { NewsletterRichEditor } from "@/components/admin/newsletter-rich-editor";
import { FormHeader } from "@/components/header";
import { MailPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { trpc } from "@/trpc/client";

const AdminPage = () => {
    const [subject, setSubject] = useState("");
    const [slug, setSlug] = useState("");
    const [html, setHtml] = useState("<p></p>");

    const utils = trpc.useUtils();
    const create = trpc.adminNewsletter.create.useMutation({
        onSuccess: () => {
            setSubject("");
            setSlug("");
            setHtml("<p></p>");
            utils.adminNewsletter.list.invalidate();
        },
    });

    async function onSave() {
        await create.mutateAsync({ subject, html, slug: slug || undefined });
    }

    return (
        <div className="max-w-4xl mx-auto pt-12 pb-16 px-4">
            <div className="space-y-4">
                <FormHeader
                    icon={<MailPlus />}
                    title="Create a newsletter issue"
                    description="Fill out the details below to create a new newsletter issue."
                />
                <Input
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="Subject line"
                />
                <div className="space-y-1">
                    <Input
                        value={slug}
                        onChange={(e) => setSlug(e.target.value)}
                        placeholder="Custom slug (optional — auto-generated from subject if blank)"
                    />
                    <p className="text-xs text-muted-foreground px-1">
                        URL: /issues/{slug.trim() || "auto-generated-from-subject"}-xxxxxxxx
                    </p>
                </div>
                <NewsletterRichEditor
                    value={html}
                    onChange={setHtml}
                    placeholder="Write the email body"
                />
                <Button onClick={onSave} disabled={create.isPending || !subject.trim()}>
                    {create.isPending ? "Saving..." : "Save draft"}
                </Button>
                {create.isSuccess && (
                    <p className="text-sm text-green-600">Newsletter saved as draft.</p>
                )}
                {create.error && (
                    <p className="text-sm text-destructive">{create.error.message}</p>
                )}
            </div>
        </div>
    );
};

export default AdminPage;
