"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/trpc/client";
import { toast } from "sonner";
import { ThumbsUp, ThumbsDown, Trash2, Lightbulb, RotateCcw } from "lucide-react";

type Tab = "new" | "good" | "bad";

function formatDate(d: Date | string | number | null | undefined) {
    if (!d) return "";
    return new Date(d).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
    });
}

export function IdeaLabView() {
    const [tab, setTab] = useState<Tab>("new");
    const utils = trpc.useUtils();

    const list = trpc.ideaLab.list.useQuery(
        { verdict: tab, limit: 100, offset: 0 },
        { refetchOnWindowFocus: false },
    );

    const invalidate = () => {
        void utils.ideaLab.list.invalidate();
        void utils.ideaLab.tasteProfile.invalidate();
    };

    const rate = trpc.ideaLab.rate.useMutation({
        onSuccess: (_data, vars) => {
            invalidate();
            toast.success(
                vars.verdict === "good"
                    ? "Marked good — the engine will learn from this"
                    : vars.verdict === "bad"
                      ? "Marked bad — noted for next runs"
                      : "Cleared",
            );
        },
        onError: (e) => toast.error(e.message),
    });

    const remove = trpc.ideaLab.remove.useMutation({
        onSuccess: () => {
            invalidate();
            toast.success("Idea deleted");
        },
        onError: (e) => toast.error(e.message),
    });

    const counts = list.data?.counts;
    const rows = list.data?.rows ?? [];

    const tabs: { key: Tab; label: string; count?: number }[] = [
        { key: "new", label: "New", count: counts?.newCount },
        { key: "good", label: "Good", count: counts?.good },
        { key: "bad", label: "Bad", count: counts?.bad },
    ];

    return (
        <div className="space-y-6">
            {/* Verdict tabs */}
            <div className="flex flex-wrap gap-2">
                {tabs.map((t) => (
                    <button
                        key={t.key}
                        onClick={() => setTab(t.key)}
                        className={`px-4 py-2 text-sm border transition-colors ${
                            tab === t.key
                                ? "border-foreground bg-foreground text-background"
                                : "border-border hover:border-foreground/30"
                        }`}
                    >
                        {t.label}
                        {typeof t.count === "number" && (
                            <span className="ml-2 text-xs opacity-70">{t.count}</span>
                        )}
                    </button>
                ))}
            </div>

            {list.isLoading && (
                <div className="space-y-4">
                    {[0, 1, 2].map((i) => (
                        <Skeleton key={i} className="h-40 w-full" />
                    ))}
                </div>
            )}

            {!list.isLoading && rows.length === 0 && (
                <Card>
                    <CardContent className="py-16 text-center text-muted-foreground">
                        <Lightbulb className="mx-auto mb-3 h-8 w-8 opacity-40" />
                        {tab === "new"
                            ? "No new ideas yet. When the research bot finds ideas, they'll land here for you to rate."
                            : tab === "good"
                              ? "No ideas marked good yet."
                              : "No ideas marked bad yet."}
                    </CardContent>
                </Card>
            )}

            <div className="space-y-4">
                {rows.map((idea) => (
                    <Card key={idea.id}>
                        <CardHeader>
                            <div className="flex items-start justify-between gap-4">
                                <CardTitle className="text-lg leading-snug">
                                    {idea.title}
                                </CardTitle>
                                {typeof idea.score === "number" && (
                                    <span className="shrink-0 border border-border px-2 py-1 text-xs font-mono">
                                        {idea.score}/35
                                    </span>
                                )}
                            </div>
                            <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                                {idea.source && <span>{idea.source}</span>}
                                <span>{formatDate(idea.createdAt)}</span>
                                {idea.verdict && (
                                    <span
                                        className={
                                            idea.verdict === "good"
                                                ? "text-foreground"
                                                : "text-muted-foreground"
                                        }
                                    >
                                        · {idea.verdict === "good" ? "👍 Good" : "👎 Bad"}
                                    </span>
                                )}
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <p className="whitespace-pre-wrap text-sm leading-relaxed">
                                {idea.pitch}
                            </p>
                            {idea.whyNow && (
                                <p className="text-sm text-muted-foreground">
                                    <span className="eyebrow">Why now</span>
                                    <br />
                                    {idea.whyNow}
                                </p>
                            )}

                            <div className="flex flex-wrap items-center gap-2 pt-2">
                                <Button
                                    size="sm"
                                    variant={idea.verdict === "good" ? "default" : "outline"}
                                    disabled={rate.isPending}
                                    onClick={() =>
                                        rate.mutate({
                                            id: idea.id,
                                            verdict: idea.verdict === "good" ? null : "good",
                                        })
                                    }
                                >
                                    <ThumbsUp className="mr-1 h-4 w-4" /> Good
                                </Button>
                                <Button
                                    size="sm"
                                    variant={idea.verdict === "bad" ? "default" : "outline"}
                                    disabled={rate.isPending}
                                    onClick={() =>
                                        rate.mutate({
                                            id: idea.id,
                                            verdict: idea.verdict === "bad" ? null : "bad",
                                        })
                                    }
                                >
                                    <ThumbsDown className="mr-1 h-4 w-4" /> Bad
                                </Button>
                                {idea.verdict && (
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        disabled={rate.isPending}
                                        onClick={() =>
                                            rate.mutate({ id: idea.id, verdict: null })
                                        }
                                    >
                                        <RotateCcw className="mr-1 h-4 w-4" /> Clear
                                    </Button>
                                )}
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    className="ml-auto text-muted-foreground"
                                    disabled={remove.isPending}
                                    onClick={() => remove.mutate({ id: idea.id })}
                                >
                                    <Trash2 className="mr-1 h-4 w-4" /> Delete
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>
        </div>
    );
}
