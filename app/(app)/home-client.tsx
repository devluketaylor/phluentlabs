"use client";

import * as React from "react";
import { z } from "zod";
import { useForm, FormProvider, useFormContext } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useSearchParams } from "next/navigation";
import { trpc } from "@/trpc/client";

import { SubscribeForm } from "@/components/forms/subscribe-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Zap, Code2, Clock, Mail, ArrowRight, Quote, Inbox, Check } from "lucide-react";
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/form";
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

// Rotating one-line testimonial slot. Static config for now (no reviews table
// yet) — an honest placeholder voice keeps the credibility band from looking
// empty and gives a clear home for real reader quotes later. Product call
// (Tessie): keep it truthful/modest rather than fabricating hype.
const TESTIMONIALS = [
    {
        quote:
            "The rare dev newsletter I actually open on Sunday — signal, not noise.",
        attribution: "A subscriber",
    },
    {
        quote: "Short, sharp, and always from something that actually shipped.",
        attribution: "A subscriber",
    },
    {
        quote: "No hype, no filler. Just the stuff worth knowing this week.",
        attribution: "A subscriber",
    },
];

// Short FAQ — answers the four questions every prospective subscriber has
// before they hand over an email. Rendered as native <details> accordions
// (no raw Radix; keyboard-accessible + zero-JS-safe by default).
const FAQS = [
    {
        q: "Is it really free?",
        a: "Yes — completely free, forever. No paywall, no premium tier, no catch. Just a good weekly read.",
    },
    {
        q: "How often will you email me?",
        a: "Once a week, every Sunday. One focused issue — never drip campaigns, never spam, never a sales blast.",
    },
    {
        q: "What's it actually about?",
        a: "The web as it's actually built: tools, patterns, and shifts pulled from real projects that shipped. Practical over hype, always filtered for signal.",
    },
    {
        q: "Can I unsubscribe?",
        a: "Anytime, in one click — every issue has an unsubscribe link, no hard feelings. You can also pause or update your preferences instead of leaving entirely.",
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

// In-place success panel shown after a successful subscribe submission.
// Sets the double-opt-in expectation (check inbox → confirm) so fewer signups
// silently drop, handles the already-subscribed case distinctly, and offers a
// spam/didn't-get-it affordance. Referral share stays on the /confirm page,
// where the confirm token that mints the personal link is available.
function SubscribeSuccess({
    email,
    alreadySubscribed,
}: {
    email: string;
    alreadySubscribed: boolean;
}) {
    return (
        <div className="flex flex-col">
            <span
                aria-hidden
                className="inline-flex h-11 w-11 items-center justify-center border border-border bg-background text-foreground"
            >
                {alreadySubscribed ? <Check className="h-5 w-5" /> : <Inbox className="h-5 w-5" />}
            </span>
            <h3 className="mt-4 text-2xl font-bold tracking-tight leading-tight">
                {alreadySubscribed ? "You're already on the list." : "Almost there — check your inbox."}
            </h3>
            {alreadySubscribed ? (
                <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
                    <span className="font-medium text-foreground">{email}</span> is already
                    subscribed. You&rsquo;ll get the next issue this Sunday — nothing else to do.
                </p>
            ) : (
                <>
                    <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
                        We just sent a confirmation link to{" "}
                        <span className="font-medium text-foreground">{email}</span>. Open it and
                        click <span className="font-medium text-foreground">Confirm</span> to lock
                        in your subscription — that&rsquo;s the last step.
                    </p>
                    <ol className="mt-5 space-y-3 border-t border-border pt-5 text-sm text-muted-foreground">
                        <li className="flex gap-3">
                            <span className="eyebrow shrink-0 text-muted-foreground">01</span>
                            <span>Open the email from PhluentLabs.</span>
                        </li>
                        <li className="flex gap-3">
                            <span className="eyebrow shrink-0 text-muted-foreground">02</span>
                            <span>Click the confirmation link inside.</span>
                        </li>
                        <li className="flex gap-3">
                            <span className="eyebrow shrink-0 text-muted-foreground">03</span>
                            <span>Done — the next issue lands this Sunday.</span>
                        </li>
                    </ol>
                    <p className="mt-5 border-t border-border pt-5 text-xs text-muted-foreground leading-relaxed">
                        Didn&rsquo;t get it? Give it a minute, then check your{" "}
                        <span className="font-medium text-foreground">spam</span> or{" "}
                        <span className="font-medium text-foreground">promotions</span> folder and
                        mark it &ldquo;not spam.&rdquo; Still nothing? Just subscribe again — a fresh
                        link takes a few seconds.
                    </p>
                </>
            )}
        </div>
    );
}

function HomePageInner({ featured, issueCount }: HomeProps) {
    // Referral attribution: a shared link looks like /?ref=<code>. We read the
    // code here and pass it to the subscribe mutation so the referrer gets
    // credited. Unknown/blank codes are safely ignored server-side.
    const searchParams = useSearchParams();
    const ref = searchParams.get("ref")?.trim() || undefined;
    const subscribeRequest = trpc.subscribe.request.useMutation();

    // In-place success state. Rather than navigating away to a bare
    // "check your inbox" screen, we keep the subscriber on the page and swap
    // the form for a success panel that sets the double-opt-in expectation
    // (check inbox + confirm), handles the already-subscribed case, and
    // surfaces a spam/didn't-get-it affordance. This keeps the highest-intent
    // moment in-context and reduces confused drop-off.
    const [result, setResult] = React.useState<{
        email: string;
        alreadySubscribed: boolean;
    } | null>(null);
    const subscriberCount = trpc.subscribe.count.useQuery(undefined, {
        staleTime: 5 * 60 * 1000,
    });

    const methods = useForm<SubscribeValues>({
        resolver: zodResolver(subscribeSchema),
        defaultValues: { email: "", firstName: "", lastName: "" },
        mode: "onTouched",
    });

    const onSubmit = async (data: SubscribeValues) => {
        const res = await subscribeRequest.mutateAsync({
            email: data.email,
            firstName: data.firstName,
            lastName: data.lastName,
            ref,
        });
        setResult({ email: data.email, alreadySubscribed: res.alreadySubscribed });
    };

    // CLS guard: the count is fetched client-side, so treat "still loading"
    // distinctly from "confirmed zero". While loading we render neutral,
    // stable copy (no "be one of the first" flash that would then flip to a
    // real number and shift layout); the empty-state copy only shows once the
    // query has actually resolved to 0.
    const countReady = subscriberCount.isSuccess;
    const n = subscriberCount.data?.count ?? 0;
    const countLabel = n >= 50 ? `${Math.floor(n / 10) * 10}+` : `${n}`;
    const isEmpty = countReady && n <= 0;

    // Rotate the testimonial slot gently client-side so the credibility band
    // feels alive without a backend. Deterministic first paint (index 0) then
    // advances every ~7s; respects prefers-reduced-motion by not rotating.
    const [quoteIdx, setQuoteIdx] = React.useState(0);
    React.useEffect(() => {
        if (typeof window !== "undefined") {
            const rm = window.matchMedia?.("(prefers-reduced-motion: reduce)");
            if (rm?.matches) return;
        }
        const t = setInterval(
            () => setQuoteIdx((i) => (i + 1) % TESTIMONIALS.length),
            7000,
        );
        return () => clearInterval(t);
    }, []);
    const testimonial = TESTIMONIALS[quoteIdx];

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
                    {/* Fixed-height line reserves space so the async count can't
                        push the layout down when it resolves (no CLS). */}
                    <p className="mt-4 min-h-5 text-sm text-muted-foreground">
                        {!countReady ? (
                            "A free weekly read for developers."
                        ) : isEmpty ? (
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
            <section className="mx-auto max-w-5xl px-4 sm:px-6 py-16 sm:py-24">
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

            {/* Credibility band — social proof + author intro */}
            <section className="border-y border-border bg-card">
                <div className="mx-auto max-w-5xl px-4 sm:px-6 py-16 sm:py-24">
                    {/* Metric row */}
                    <div className="grid grid-cols-3 gap-px border border-border bg-border">
                        <div className="bg-card p-5 sm:p-6">
                            <div className="text-3xl sm:text-4xl font-bold tracking-tight">
                                {!countReady ? "\u2014" : isEmpty ? "New" : countLabel}
                            </div>
                            <div className="eyebrow mt-1 text-muted-foreground">
                                {!countReady
                                    ? "Developers reading"
                                    : isEmpty
                                      ? "Just launched"
                                      : `Developer${n === 1 ? "" : "s"} reading`}
                            </div>
                        </div>
                        <div className="bg-card p-5 sm:p-6">
                            <div className="text-3xl sm:text-4xl font-bold tracking-tight">
                                {issueCount}
                            </div>
                            <div className="eyebrow mt-1 text-muted-foreground">
                                Issue{issueCount === 1 ? "" : "s"} published
                            </div>
                        </div>
                        <div className="bg-card p-5 sm:p-6">
                            <div className="text-3xl sm:text-4xl font-bold tracking-tight">
                                Weekly
                            </div>
                            <div className="eyebrow mt-1 text-muted-foreground">Every Sunday</div>
                        </div>
                    </div>

                    {/* Rotating testimonial + author intro */}
                    <div className="mt-8 grid gap-px border border-border bg-border md:grid-cols-2">
                        <div className="bg-card p-6 sm:p-8">
                            <Quote className="h-5 w-5 text-muted-foreground" aria-hidden />
                            <blockquote
                                key={quoteIdx}
                                className="mt-4 text-lg font-medium leading-snug transition-opacity"
                            >
                                &ldquo;{testimonial.quote}&rdquo;
                            </blockquote>
                            <div className="eyebrow mt-4 text-muted-foreground">
                                {testimonial.attribution}
                            </div>
                        </div>
                        <div className="flex flex-col justify-center bg-card p-6 sm:p-8">
                            <span className="eyebrow text-muted-foreground">Written by</span>
                            <h3 className="mt-2 text-xl font-bold tracking-tight">Luke Taylor</h3>
                            <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                                Developer and builder. PhluentLabs is where I write up what
                                I&apos;m actually shipping — the tools, patterns, and shifts that
                                earned their place in a real codebase.
                            </p>
                            <a
                                href="https://x.com/luketaylordev"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-foreground transition-colors hover:text-muted-foreground"
                            >
                                Follow on X &rarr;
                            </a>
                        </div>
                    </div>
                </div>
            </section>

            {/* Featured latest issue */}
            {featured && (
                <section className="mx-auto max-w-5xl px-4 sm:px-6 py-16 sm:py-24">
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
            <section id="subscribe" className="scroll-mt-20 mx-auto max-w-5xl px-4 sm:px-6 py-16 sm:py-24">
            <div className="grid gap-px border border-border bg-border md:grid-cols-2">
            <div className="flex flex-col justify-center bg-card p-6 sm:p-10">
                <span className="eyebrow text-muted-foreground">Join the list</span>
                <h2 className="mt-3 text-3xl font-bold tracking-tight leading-tight">Get the next issue in your inbox.</h2>
                <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
                    Free, every Sunday. One focused read — no drip campaigns, no spam.
                    Unsubscribe anytime, no hard feelings.
                </p>
                {countReady && !isEmpty && (
                    <p className="mt-4 text-sm text-muted-foreground">
                        Trusted by{" "}
                        <span className="font-semibold text-foreground">{countLabel}</span>{" "}
                        developer{n === 1 ? "" : "s"}.
                    </p>
                )}
            </div>
            <div className="bg-card p-6 sm:p-10">
                {result ? (
                    <SubscribeSuccess
                        email={result.email}
                        alreadySubscribed={result.alreadySubscribed}
                    />
                ) : (
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
                )}
            </div>
            </div>
            </section>

            {/* FAQ — native <details> accordion, monochrome */}
            <section className="mx-auto max-w-5xl px-4 sm:px-6 py-16 sm:py-24">
                <h2 className="eyebrow mb-8 text-muted-foreground">Frequently asked</h2>
                <div className="border border-border">
                    {FAQS.map((f, i) => (
                        <details
                            key={f.q}
                            className={`group bg-card ${i > 0 ? "border-t border-border" : ""}`}
                        >
                            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-5 sm:p-6 text-base font-medium transition-colors hover:text-foreground [&::-webkit-details-marker]:hidden">
                                {f.q}
                                <ArrowRight
                                    aria-hidden
                                    className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-90"
                                />
                            </summary>
                            <p className="px-5 sm:px-6 pb-5 sm:pb-6 -mt-1 text-sm text-muted-foreground leading-relaxed">
                                {f.a}
                            </p>
                        </details>
                    ))}
                </div>
            </section>

            {/* Final CTA band — close the page on conversion */}
            <section className="mx-auto max-w-5xl px-4 sm:px-6 py-16 sm:py-24">
                <div className="relative overflow-hidden border border-border bg-card px-6 py-14 sm:px-12 sm:py-20 text-center">
                    <div
                        aria-hidden
                        className="pointer-events-none absolute inset-0 opacity-[0.06]"
                        style={{
                            backgroundImage:
                                "linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)",
                            backgroundSize: "48px 48px",
                        }}
                    />
                    <div className="relative">
                        <span className="eyebrow text-muted-foreground">One email a week</span>
                        <h2 className="mt-4 mx-auto max-w-2xl text-3xl sm:text-5xl font-bold tracking-tight leading-[1.05]">
                            Start reading this Sunday.
                        </h2>
                        <p className="mt-4 mx-auto max-w-xl text-muted-foreground leading-relaxed">
                            Join the list and get the next issue the moment it ships. Free forever,
                            unsubscribe anytime.
                        </p>
                        <div className="mt-8 flex justify-center">
                            <a href="#subscribe">
                                <Button size="lg" className="gap-2">
                                    Subscribe free <ArrowRight className="h-4 w-4" />
                                </Button>
                            </a>
                        </div>
                    </div>
                </div>
            </section>

            {/* Past issues */}
            <section className="border-t border-border mx-auto max-w-5xl px-4 sm:px-6 py-16 sm:py-24">
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
