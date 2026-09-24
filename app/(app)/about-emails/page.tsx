import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
    title: "Why am I getting this?",
    description:
        "Who sends PhluentLabs emails, how often, how to unsubscribe or manage your preferences, and our double opt-in promise — no purchased lists, ever.",
};

/**
 * Public sender-transparency / trust page. Explains who sends the emails,
 * cadence, how to manage/unsubscribe, and the double opt-in promise. Linked
 * from the site footer + the email send-footer. Pure static public UI, no
 * auth, no schema, monochrome design system (dark-default, light+dark safe).
 */
export default function AboutEmailsPage() {
    return (
        <main className="mx-auto max-w-2xl px-4 sm:px-6">
            <section className="space-y-3 py-10 sm:py-14">
                <p className="eyebrow text-muted-foreground">Sender transparency</p>
                <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
                    Why am I getting this email?
                </h1>
                <p className="text-muted-foreground leading-relaxed">
                    Short version: you signed up for <strong>PhluentLabs</strong> and
                    confirmed your email address. We only send to people who explicitly
                    asked to hear from us — and we make it one click to stop. Here&apos;s
                    exactly how it works.
                </p>
            </section>

            <section className="space-y-4">
                <div className="border border-border p-5 sm:p-6">
                    <h2 className="font-semibold">Who sends these</h2>
                    <p className="mt-1 text-sm text-muted-foreground leading-relaxed">
                        PhluentLabs is a free newsletter for working developers — field
                        notes from real projects, with the hype filtered out. Every issue
                        comes from the PhluentLabs team. A real person reads every reply.
                    </p>
                </div>

                <div className="border border-border p-5 sm:p-6">
                    <h2 className="font-semibold">How often we email you</h2>
                    <p className="mt-1 text-sm text-muted-foreground leading-relaxed">
                        One issue a week, typically on <strong>Sunday</strong>. That&apos;s
                        it — no drip campaigns, no daily blasts, no &ldquo;re-engagement&rdquo;
                        spam. The occasional one-off is only ever a confirmation or a
                        transactional message you triggered yourself.
                    </p>
                </div>

                <div className="border border-border p-5 sm:p-6">
                    <h2 className="font-semibold">Our double opt-in promise</h2>
                    <p className="mt-1 text-sm text-muted-foreground leading-relaxed">
                        You&apos;re on the list because you entered your address{" "}
                        <em>and</em> clicked the confirmation link we emailed you. We use{" "}
                        <strong>double opt-in</strong> so nobody gets added without proving
                        the inbox is theirs.
                    </p>
                    <ul className="mt-3 space-y-1.5 text-sm text-muted-foreground">
                        <li>
                            <strong>We never buy, rent, or scrape email lists.</strong> Every
                            subscriber opted in directly.
                        </li>
                        <li>
                            <strong>We never sell or share your address.</strong> It&apos;s
                            used to send you the newsletter — nothing else.
                        </li>
                        <li>
                            If you didn&apos;t sign up, you can safely ignore any confirmation
                            email — you&apos;re not subscribed until you click the link.
                        </li>
                    </ul>
                </div>

                <div className="border border-border p-5 sm:p-6">
                    <h2 className="font-semibold">Manage or stop your emails</h2>
                    <p className="mt-1 text-sm text-muted-foreground leading-relaxed">
                        You&apos;re always in control. Every issue includes an unsubscribe
                        link in the footer, and you can update your name, pause delivery, or
                        leave entirely from your preferences center.
                    </p>
                    <ul className="mt-3 space-y-1.5 text-sm text-muted-foreground">
                        <li>
                            <strong>Unsubscribe:</strong> click the unsubscribe link at the
                            bottom of any issue — one click, no login, effective immediately.
                        </li>
                        <li>
                            <strong>Pause instead of leave:</strong> the preferences center
                            lets you snooze delivery for a few weeks if you just need a break.
                        </li>
                        <li>
                            <strong>Update your details:</strong> change your name or email
                            address from the preferences center too.
                        </li>
                    </ul>
                    <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
                        To reach your preferences center, use the{" "}
                        <em>manage preferences</em> or <em>unsubscribe</em> link in any email
                        we&apos;ve sent you — those links are tied to your account so no
                        password is needed.
                    </p>
                </div>

                <div className="border border-border p-5 sm:p-6">
                    <h2 className="font-semibold">Still not sure?</h2>
                    <p className="mt-1 text-sm text-muted-foreground leading-relaxed">
                        If an email looks off, or you think you&apos;re getting mail you never
                        asked for, just reply to it — a real person reads every response and
                        will sort it out. We&apos;d always rather you flag it than mark it as
                        spam.
                    </p>
                </div>
            </section>

            <section className="text-muted-foreground space-y-2 py-10 text-sm">
                <p>
                    Want to subscribe?{" "}
                    <Link href="/#subscribe" className="text-foreground underline underline-offset-4">
                        Sign up here
                    </Link>
                    .
                </p>
                <p>
                    Curious how we keep deliverability high? See our{" "}
                    <Link
                        href="/docs/deliverability"
                        className="text-foreground underline underline-offset-4"
                    >
                        deliverability guide
                    </Link>
                    .
                </p>
            </section>
        </main>
    );
}
