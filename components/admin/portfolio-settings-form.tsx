"use client";

import { trpc } from "@/trpc/client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { NewsletterRichEditor } from "@/components/admin/newsletter-rich-editor";

type Form = {
    heroTitle: string;
    heroSubtitle: string;
    aboutHtml: string;
    githubUrl: string;
    twitterUrl: string;
    linkedinUrl: string;
    email: string;
};

const emptyForm: Form = {
    heroTitle: "",
    heroSubtitle: "",
    aboutHtml: "",
    githubUrl: "",
    twitterUrl: "",
    linkedinUrl: "",
    email: "",
};

export const PortfolioSettingsForm = () => {
    const utils = trpc.useUtils();
    const settings = trpc.adminPortfolio.getSettings.useQuery();
    const [form, setForm] = useState<Form>(emptyForm);
    const [hydrated, setHydrated] = useState(false);

    // Hydrate the form once from the server row (or defaults).
    useEffect(() => {
        if (hydrated || settings.isLoading) return;
        const row = settings.data?.row;
        if (row) {
            setForm({
                heroTitle: row.heroTitle ?? "",
                heroSubtitle: row.heroSubtitle ?? "",
                aboutHtml: row.aboutHtml ?? "",
                githubUrl: row.githubUrl ?? "",
                twitterUrl: row.twitterUrl ?? "",
                linkedinUrl: row.linkedinUrl ?? "",
                email: row.email ?? "",
            });
        }
        setHydrated(true);
    }, [settings.data, settings.isLoading, hydrated]);

    const save = trpc.adminPortfolio.saveSettings.useMutation({
        onSuccess: () => {
            toast.success("Settings saved");
            void utils.adminPortfolio.getSettings.invalidate();
        },
        onError: (e) => toast.error(e.message),
    });

    const onSave = () => {
        save.mutate({
            heroTitle: form.heroTitle,
            heroSubtitle: form.heroSubtitle,
            aboutHtml: form.aboutHtml,
            githubUrl: form.githubUrl.trim() || undefined,
            twitterUrl: form.twitterUrl.trim() || undefined,
            linkedinUrl: form.linkedinUrl.trim() || undefined,
            email: form.email.trim() || undefined,
        });
    };

    return (
        <div className="space-y-4">
            <Card className="p-4 space-y-4">
                <div className="space-y-2">
                    <Label htmlFor="ps-hero-title">Hero title</Label>
                    <Input
                        id="ps-hero-title"
                        value={form.heroTitle}
                        onChange={(e) => setForm((f) => ({ ...f, heroTitle: e.target.value }))}
                        placeholder="Luke Taylor"
                        maxLength={200}
                    />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="ps-hero-sub">Hero subtitle</Label>
                    <Input
                        id="ps-hero-sub"
                        value={form.heroSubtitle}
                        onChange={(e) => setForm((f) => ({ ...f, heroSubtitle: e.target.value }))}
                        placeholder="CS student building on the web."
                        maxLength={500}
                    />
                </div>
                <div className="space-y-2">
                    <Label>About</Label>
                    <NewsletterRichEditor
                        value={form.aboutHtml}
                        onChange={(html) => setForm((f) => ({ ...f, aboutHtml: html }))}
                        placeholder="A few paragraphs about you…"
                    />
                </div>
            </Card>

            <Card className="p-4 space-y-4">
                <p className="eyebrow text-muted-foreground">Links</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-2">
                        <Label htmlFor="ps-github">GitHub URL</Label>
                        <Input
                            id="ps-github"
                            value={form.githubUrl}
                            onChange={(e) => setForm((f) => ({ ...f, githubUrl: e.target.value }))}
                            placeholder="https://github.com/devluketaylor"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="ps-twitter">Twitter / X URL</Label>
                        <Input
                            id="ps-twitter"
                            value={form.twitterUrl}
                            onChange={(e) => setForm((f) => ({ ...f, twitterUrl: e.target.value }))}
                            placeholder="https://x.com/…"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="ps-linkedin">LinkedIn URL</Label>
                        <Input
                            id="ps-linkedin"
                            value={form.linkedinUrl}
                            onChange={(e) => setForm((f) => ({ ...f, linkedinUrl: e.target.value }))}
                            placeholder="https://linkedin.com/in/…"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="ps-email">Contact email</Label>
                        <Input
                            id="ps-email"
                            value={form.email}
                            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                            placeholder="you@luketaylor.io"
                        />
                    </div>
                </div>
            </Card>

            <div className="flex justify-end">
                <Button onClick={onSave} disabled={save.isPending}>
                    {save.isPending ? "Saving…" : "Save settings"}
                </Button>
            </div>
        </div>
    );
};
