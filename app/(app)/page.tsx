"use client";

import * as React from "react";
import { z } from "zod";
import { useForm, FormProvider, useFormContext } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { trpc } from "@/trpc/client";

import { SubscribeForm } from "@/components/forms/subscribe-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/form";
import { Separator } from "@/components/ui/separator";
import { NewsletterList } from "@/components/newsletter-list";

const subscribeSchema = z.object({
    email: z.string().email("Enter a valid email"),
    firstName: z.string().min(1, "First name is required"),
    lastName: z.string().min(1, "Last name is required"),
});

type SubscribeValues = z.infer<typeof subscribeSchema>;

function EmailStep() {
    const { control } = useFormContext<SubscribeValues>();
    return (
        <FormField
            control={control}
            name="email"
            render={({ field }) => (
                <FormItem>
                    <FormLabel>Email address</FormLabel>
                    <FormControl>
                        <Input placeholder="you@domain.com" {...field} />
                    </FormControl>
                    <FormMessage />
                </FormItem>
            )}
        />
    );
}

function NameStep() {
    const { control } = useFormContext<SubscribeValues>();
    return (
        <div className="grid gap-4 sm:grid-cols-2">
            <FormField
                control={control}
                name="firstName"
                render={({ field }) => (
                    <FormItem>
                        <FormLabel>First name</FormLabel>
                        <FormControl>
                            <Input placeholder="First" {...field} />
                        </FormControl>
                        <FormMessage />
                    </FormItem>
                )}
            />
            <FormField
                control={control}
                name="lastName"
                render={({ field }) => (
                    <FormItem>
                        <FormLabel>Last name</FormLabel>
                        <FormControl>
                            <Input placeholder="Last" {...field} />
                        </FormControl>
                        <FormMessage />
                    </FormItem>
                )}
            />
        </div>
    );
}

function ConfirmStep() {
    const { getValues } = useFormContext<SubscribeValues>();
    const { email, firstName, lastName } = getValues();
    return (
        <div className="space-y-1 text-sm">
            <div><span className="font-medium">Email:</span> {email}</div>
            <div><span className="font-medium">Name:</span> {firstName} {lastName}</div>
            <p className="text-muted-foreground pt-1">Click Subscribe to finish.</p>
        </div>
    );
}

export default function HomePage() {
    const router = useRouter();
    const subscribeRequest = trpc.subscribe.request.useMutation();

    const methods = useForm<SubscribeValues>({
        resolver: zodResolver(subscribeSchema),
        defaultValues: { email: "", firstName: "", lastName: "" },
        mode: "onTouched",
    });

    const onSubmit = async (data: SubscribeValues) => {
        await subscribeRequest.mutateAsync({
            email: data.email,
            firstName: data.firstName,
            lastName: data.lastName,
        });
        router.push("/confirm");
    };

    return (
        <main className="mx-auto max-w-2xl px-6">
            {/* Hero */}
            <section className="py-16 text-center space-y-4">
                <div className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs text-muted-foreground mb-2">
                    Weekly · For developers
                </div>
                <h1 className="text-4xl font-bold tracking-tight">
                    <span className="bg-linear-to-tr from-primary to-red-500 bg-clip-text text-transparent">
                        PhluentLabs
                    </span>
                </h1>
                <p className="text-muted-foreground text-lg max-w-md mx-auto leading-relaxed">
                    Weekly insights on tools, patterns, and code — straight to your inbox.
                </p>
                <p className="text-sm text-muted-foreground">
                    Join <span className="font-semibold text-foreground">100+</span> developers already subscribed.
                </p>
            </section>

            {/* Subscribe form */}
            <section className="rounded-2xl border bg-card p-6 shadow-sm">
                <h2 className="font-semibold mb-4">Subscribe for free</h2>
                <FormProvider {...methods}>
                    <Form {...methods}>
                        <SubscribeForm<SubscribeValues>
                            methods={methods}
                            steps={[
                                { name: "Email", fields: ["email"], children: <EmailStep /> },
                                { name: "Your name", fields: ["firstName", "lastName"], children: <NameStep /> },
                                { name: "Confirm", children: <ConfirmStep /> },
                            ]}
                            onSubmit={onSubmit}
                            controls={({ isFirstStep, isLastStep, back, next, submit }) => (
                                <div className="mt-5 flex gap-2">
                                    {!isFirstStep && (
                                        <Button type="button" variant="outline" onClick={back}>
                                            Back
                                        </Button>
                                    )}
                                    {!isLastStep ? (
                                        <Button type="button" onClick={next} className="w-full">
                                            Continue
                                        </Button>
                                    ) : (
                                        <Button
                                            type="button"
                                            onClick={submit}
                                            disabled={subscribeRequest.isPending}
                                            className="w-full"
                                        >
                                            {subscribeRequest.isPending ? "Subscribing..." : "Subscribe"}
                                        </Button>
                                    )}
                                </div>
                            )}
                        />
                    </Form>
                </FormProvider>
            </section>

            <Separator className="my-12" />

            {/* Past issues */}
            <section className="pb-16">
                <div className="flex items-baseline justify-between mb-6">
                    <h2 className="text-lg font-semibold">Past issues</h2>
                </div>
                <NewsletterList />
            </section>
        </main>
    );
}
