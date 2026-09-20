"use client";

import * as React from "react";
import { z } from "zod";
import { useForm, FormProvider, useFormContext } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter, useSearchParams } from "next/navigation";
import { trpc } from "@/trpc/client";

import { SubscribeForm } from "@/components/forms/subscribe-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Zap, Code2, Clock, Mail, ArrowRight } from "lucide-react";
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

type Featured = {
    slug: string;
    subject: string;
    preheader: string | null;
    date: string | null;
} | null;

type HomeProps = { featured: Featured; issueCount: number };

// What subscribers get — numbered value cards under the hero.
const VALUE_PROPS = [
    {
        index: "01",
        icon: Code2,
        title: "From real builds",
        body: "Every issue starts in the editor, not the echo chamber — notes, patterns, and tools pulled from projects that actually shipped.",
    },
    {
        index: "02",
        icon: Clock,
        title: "One Sunday email",
        body: "A single focused read each week. Five minutes, no drip campaigns, no filler — just the issue.",
    },
    {
        index: "03",
        icon: Zap,
        title: "Zero hype",
        body: "Frameworks, tooling, and AI shifts — filtered hard. If it wouldn't survive contact with a real codebase, it doesn't make the cut.",
    },
];

// The promises band under the hero — honest, mono, load-bearing.
const PROMISES = ["Every Sunday", "~5 min read", "Free forever", "Unsubscribe anytime"];

function formatDate(iso: string | null) {
    if (!iso) return "";
    return new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

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

function HomePageInner({ featured, issueCount }: HomeProps) {
    const router = useRouter();
    // Referral attribution: a shared link looks like /?ref=<code>. We read the
    // code here and pass it to the subscribe mutation so the referrer gets
    // credited. Unknown/blank codes are safely ignored server-side.
    const searchParams = useSearchParams();
    const ref = searchParams.get("ref")?.trim() || undefined;
    const subscribeRequest = trpc.subscribe.request.useMutation();
    const subscriberCount = trpc.subscribe.count.useQuery(undefined, {
        staleTime: 5 * 60 * 1000,
    });

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
            ref,
        });
        router.push("/confirm");
    };

    const n = subscriberCount.data?.count ?? 0;
    const countLabel = n >= 50 ? `${Math.floor(n / 10) * 10}+` : `${n}`;

    return (
        <main>
            {/* Hero — editorial, left-aligned, monochrome grid texture */}
            <section className="relative overflow-hidden border-b border-border">
                {/* Subtle monochrome grid backdrop */}
                <div
                    aria-hidden
                    className="pointer-events-none absolute inset-0 opacity-[0.06]"
                    style={{
                        backgroundImage:
                            "linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)",
                        backgroundSize: "48px 48px",
                    }}
                />
                {/* Radial vignette — fades the grid toward the edges for depth */}
                <div
                    aria-hidden
                    className="pointer-events-none absolute inset-0"
                    style={{
                        background:
                            "radial-gradient(120% 80% at 20% 0%, transparent 40%, var(--background) 100%)",
                    }}
                />
                {/* Hairline crosshair accent — top-right corner framing detail */}
                <div
                    aria-hidden
                    className="pointer-events-none absolute right-6 top-6 hidden h-16 w-16 sm:block"
                >
                    <div className="absolute right-0 top-0 h-full w-px bg-border" />
                    <div className="absolute right-0 top-0 h-px w-full bg-border" />
                </div>
                <div className="relative mx-auto max-w-5xl px-4 sm:px-6 pt-20 sm:pt-28 pb-14 sm:pb-20">
                    <div className="eyebrow inline-flex items-center gap-2 border border-border px-3 py-1 text-muted-foreground">
                        <Mail className="h-3 w-3" /> PhluentLabs · A weekly newsletter for developers
                    </div>
                    <h1 className="mt-6 max-w-3xl text-5xl sm:text-7xl font-bold tracking-tight leading-[0.98]">
                        The web, as it&apos;s actually built.
                    </h1>
                    <p className="mt-6 max-w-2xl text-muted-foreground text-lg sm:text-xl leading-relaxed">
                        A free Sunday newsletter for working developers. Field notes from real
                        projects — the tools, patterns, and shifts worth your attention, with the
                        hype filtered out. Written by Luke Taylor, one issue a week.
                    </p>
                    <div className="mt-8 flex flex-wrap items-center gap-4">
                        <a href="#subscribe">
                            <Button size="lg" className="gap-2">
                                Subscribe free <ArrowRight className="h-4 w-4" />
                            </Button>
                        </a>
                        <a
                            href="/issues"
                            className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
                        >
                            Browse the archive &rarr;
                        </a>
                    </div>
                    <p className="mt-4 text-sm text-muted-foreground">
                        {n <= 0 ? (
                            "Be one of the first developers on the list."
                        ) : (
                            <>
                                Read alongside{" "}
                                <span className="font-semibold text-foreground">{countLabel}</span>{" "}
                                other developer{n === 1 ? "" : "s"}.
                            </>
                        )}
                    </p>
                </div>
                {/* Promise band — hairline strip along the hero's base */}
                <div className="relative border-t border-border">
                    <div className="mx-auto grid max-w-5xl grid-cols-2 sm:grid-cols-4 px-4 sm:px-6">
                        {PROMISES.map((p, i) => (
                            <div
                                key={p}
                                className={`eyebrow py-4 text-muted-foreground ${i > 0 ? "sm:border-l sm:border-border sm:pl-6" : ""}`}
                            >
                                {p}
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* What you'll get — numbered value cards */}
            <section className="mx-auto max-w-5xl px-4 sm:px-6 py-16 sm:py-20">
                <h2 className="eyebrow mb-8 text-muted-foreground">What you&apos;ll get</h2>
                <div className="grid gap-px border border-border bg-border sm:grid-cols-3">
                    {VALUE_PROPS.map((v) => (
                        <div key={v.title} className="bg-card p-6 sm:p-8">
                            <div className="flex items-center justify-between">
                                <v.icon className="h-6 w-6" />
                                <span className="eyebrow text-muted-foreground">{v.index}</span>
                            </div>
                            <h3 className="mt-4 text-lg font-semibold">{v.title}</h3>
                            <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{v.body}</p>
                        </div>
                    ))}
                </div>
            </section>

            {/* Featured latest issue */}
            {featured && (
                <section className="mx-auto max-w-5xl px-4 sm:px-6 pb-16 sm:pb-20">
                    <h2 className="eyebrow mb-6 text-muted-foreground">Latest issue</h2>
                    <a
                        href={`/issues/${featured.slug}`}
                        className="group block border border-border bg-card p-6 sm:p-8 transition-colors hover:border-foreground/40"
                    >
                        {featured.date && (
                            <p className="eyebrow text-muted-foreground">{formatDate(featured.date)}</p>
                        )}
                        <h3 className="mt-2 text-2xl font-bold tracking-tight">{featured.subject}</h3>
                        {featured.preheader && (
                            <p className="mt-3 text-muted-foreground leading-relaxed">{featured.preheader}</p>
                        )}
                        <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-foreground">
                            Read issue
                            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                        </span>
                    </a>
                </section>
            )}

            {/* Subscribe form */}
            <section id="subscribe" className="mx-auto max-w-5xl px-4 sm:px-6">
            <div className="grid gap-px border border-border bg-border md:grid-cols-2">
            <div className="flex flex-col justify-center bg-card p-6 sm:p-10">
                <span className="eyebrow text-muted-foreground">Join the list</span>
                <h2 className="mt-3 text-3xl font-bold tracking-tight leading-tight">Get the next issue in your inbox.</h2>
                <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
                    Free, every Sunday. One focused read — no drip campaigns, no spam.
                    Unsubscribe anytime, no hard feelings.
                </p>
                {n > 0 && (
                    <p className="mt-4 text-sm text-muted-foreground">
                        Trusted by{" "}
                        <span className="font-semibold text-foreground">{countLabel}</span>{" "}
                        developer{n === 1 ? "" : "s"}.
                    </p>
                )}
            </div>
            <div className="bg-card p-6 sm:p-10">
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
                                        <Button type="button" onClick={next}>
                                            Continue
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
            </div>
            </section>

            <div className="mx-auto max-w-5xl px-4 sm:px-6">
                <Separator className="my-12" />
            </div>

            {/* Past issues */}
            <section className="mx-auto max-w-5xl px-4 sm:px-6 pb-16">
                <div className="flex items-baseline justify-between mb-6">
                    <h2 className="eyebrow text-muted-foreground">Past issues</h2>
                    <a
                        href="/issues"
                        className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                    >
                        View all &rarr;
                    </a>
                </div>
                <NewsletterList />
            </section>
        </main>
    );
}

export default function HomeClient(props: HomeProps) {
    // useSearchParams (read in HomePageInner for ?ref=) requires a Suspense
    // boundary during prerender; wrap so the build stays happy.
    return (
        <React.Suspense fallback={null}>
            <HomePageInner {...props} />
        </React.Suspense>
    );
}
