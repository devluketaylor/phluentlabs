"use client";

import * as React from "react";
import { z } from "zod";
import { useForm, FormProvider, useFormContext } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { trpc } from "@/trpc/client";

import { SubscribeForm } from "@/components/forms/subscribe-form"; // adjust path

// shadcn (adjust paths to your project)
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
import {FormHeader} from "@/components/header";
import {MailboxIcon} from "lucide-react";

const subscribeSchema = z.object({
    email: z.string().email("Enter a valid email"),
    firstName: z.string().min(1, "First name is required"),
    lastName: z.string().min(1, "Last name is required"),
});

type SubscribeValues = z.infer<typeof subscribeSchema>;

function EmailStep() {
    const { control } = useFormContext<SubscribeValues>();

    return (
        <div className="space-y-4">
            <FormField
                control={control}
                name="email"
                render={({ field }) => (
                    <FormItem>
                        <FormLabel>Email</FormLabel>
                        <FormControl>
                            <Input placeholder="you@domain.com" {...field} />
                        </FormControl>
                        <FormMessage />
                    </FormItem>
                )}
            />
        </div>
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
        <div className="space-y-2 text-sm">
            <div><span className="font-medium">Email:</span> {email}</div>
            <div><span className="font-medium">Name:</span> {firstName} {lastName}</div>
            <p className="text-muted-foreground">Click Subscribe to finish.</p>
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
        <main className="mx-auto max-w-lg p-6">
            <FormHeader icon={<MailboxIcon />} title={"Join 100+ Developers"} description={"Get new issues straight into your inbox."} />
            <div className="mt-6 rounded-xl border p-4">
                <FormProvider {...methods}>
                    {/* If you use shadcn Form wrapper, it just provides styling/structure */}
                    <Form {...methods}>
                        <SubscribeForm<SubscribeValues>
                            methods={methods}
                            steps={[
                                { name: "Email", fields: ["email"], children: <EmailStep /> },
                                {
                                    name: "Your name",
                                    fields: ["firstName", "lastName"],
                                    children: <NameStep />,
                                },
                                { name: "Confirm", children: <ConfirmStep /> },
                            ]}
                            onSubmit={onSubmit}
                            controls={({ isFirstStep, isLastStep, back, next, submit }) => (
                                <div className="mt-6 flex gap-2">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={back}
                                        disabled={isFirstStep}
                                    >
                                        Back
                                    </Button>

                                    {!isLastStep ? (
                                        <Button type="button" onClick={next}>
                                            Next
                                        </Button>
                                    ) : (
                                        <Button
                                            type="button"
                                            onClick={submit}
                                            disabled={subscribeRequest.isPending}
                                        >
                                            {subscribeRequest.isPending ? "Subscribing..." : "Subscribe"}
                                        </Button>
                                    )}
                                </div>
                            )}
                        />
                    </Form>
                </FormProvider>
            </div>
        </main>
    );
}