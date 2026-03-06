"use client";

import { Suspense } from "react";
import {useSearchParams} from "next/navigation";
import {trpc} from "@/trpc/client";
import {Card} from "@/components/ui/card";
import {Button} from "@/components/ui/button";

function UnsubscribeContent() {
    const params = useSearchParams();
    const token = params.get("token") ?? ""

    const unsubscribe = trpc.subscribe.unsubscribe.useMutation();

    const onUnsubscribe = async () => {
        if (!token) return;
        await unsubscribe.mutateAsync({ token });
    }

    return (
        <Card className="w-full max-w-md p-6">
            <h1 className="text-xl font-semibold">Unsubscribe</h1>
            <p className="mt-2 text-sm text-muted-foreground">
                {token
                    ? "Click the button below to stop receiving emails."
                    : "This link is missing a token. Please use the unsubscribe link from an email."}
            </p>

            <div className="mt-6 flex flex-col gap-3">
                <Button
                    onClick={onUnsubscribe}
                    disabled={!token || unsubscribe.isPending || unsubscribe.isSuccess}
                >
                    {unsubscribe.isPending
                        ? "Unsubscribing..."
                        : unsubscribe.isSuccess
                            ? "Unsubscribed"
                            : "Unsubscribe"}
                </Button>

                {unsubscribe.error ? (
                    <p className="text-sm text-red-500">{unsubscribe.error.message}</p>
                ) : null}

                {unsubscribe.isSuccess ? (
                    <p className="text-sm">
                        You’re unsubscribed. You won’t get future newsletter emails.
                    </p>
                ) : null}
            </div>
        </Card>
    )
}

export default function UnsubscribePage() {
    return (
        <main className="min-h-[calc(100vh-1px)] flex items-center justify-center p-6">
            <Suspense fallback={<p className="text-sm text-muted-foreground">Loading...</p>}>
                <UnsubscribeContent />
            </Suspense>
        </main>
    );
}