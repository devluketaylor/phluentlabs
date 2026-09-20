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

// What subscribers get — value-prop cards under the hero.
const VALUE_PROPS = [
    {
        icon: Code2,
        title: "For developers",
        body: "Practical notes from building on the modern web — frameworks, tooling, and the patterns actually worth your time.",
    },
    {
        icon: Clock,
        title: "Every Sunday",
        body: "One focused issue a week. No spam, no filler — just what's worth knowing, delivered on a predictable cadence.",
    },
    {
        icon: Zap,
        title: "Signal over noise",
        body: "What I'm noticing while shipping real projects — curated so you skip the hype and keep the substance.",
    },
];

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
            {/* Hero — full-bleed, monochrome grid texture */}
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
                <div className="relative mx-auto max-w-4xl px-4 sm:px-6 py-20 sm:py-28 text-center space-y-6">
                    <div className="eyebrow inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 text-muted-foreground">
                        <Mail className="h-3 w-3" /> A free weekly newsletter
                    </div>
                    <h1 className="mx-auto max-w-3xl text-4xl sm:text-6xl font-bold tracking-tight leading-[1.05]">
                        What I&apos;m noticing while building the web
                    </h1>
                    <p className="mx-auto max-w-xl text-muted-foreground text-lg sm:text-xl leading-relaxed">
                        Practical dev insight, curated every Sunday and delivered straight to your
                        inbox. By Luke Taylor.
                    </p>
                    <div className="flex flex-col items-center gap-3 pt-2">
                        <a href="#subscribe">
                            <Button size="lg" className="gap-2">
                                Subscribe free <ArrowRight className="h-4 w-4" />
                            </Button>
                        </a>
                        <p className="text-sm text-muted-foreground">
                            {n <= 0 ? (
                                "Be one of the first developers to subscribe."
                            ) : (
                                <>
                                    Join <span className="font-semibold text-foreground">{countLabel}</span>{" "}
                                    developer{n === 1 ? "" : "s"} already subscribed.
                                </>
                            )}
                        </p>
                    </div>
                </div>
            </section>

            {/* What you'll get — value props */}
            <section className="mx-auto max-w-5xl px-4 sm:px-6 py-16 sm:py-20">
                <h2 className="eyebrow mb-8 text-center text-muted-foreground">What you&apos;ll get</h2>
                <div className="grid gap-px border border-border bg-border sm:grid-cols-3">
                    {VALUE_PROPS.map((v) => (
                        <div key={v.title} className="bg-card p-6 sm:p-8">
                            <v.icon className="h-6 w-6" />
                            <h3 className="mt-4 text-lg font-semibold">{v.title}</h3>
                            <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{v.body}</p>
                        </div>
                    ))}
                </div>
            </section>

            {/* Featured latest issue */}
            {featured && (
                <section className="mx-auto max-w-4xl px-4 sm:px-6 pb-16 sm:pb-20">
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
            <section id="subscribe" className="mx-auto max-w-2xl px-4 sm:px-6">
            <div className="border border-border bg-card p-6 sm:p-8">
                <h2 className="eyebrow mb-4 text-muted-foreground">Subscribe for free</h2>
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
            </section>

            <div className="mx-auto max-w-2xl px-4 sm:px-6">
                <Separator className="my-12" />
            </div>

            {/* Past issues */}
            <section className="mx-auto max-w-2xl px-4 sm:px-6 pb-16">
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
