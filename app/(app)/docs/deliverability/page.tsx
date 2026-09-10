import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Email Deliverability",
    description:
        "How to set up SPF, DKIM, and DMARC for your sending domain and land newsletters in the inbox instead of spam.",
};

/**
 * Public deliverability guide (SPF/DKIM/DMARC + inbox-placement tips). Lives
 * inside the (app) group so it gets the site chrome. Pure static content, no
 * auth, no secrets. Records are described generically because the exact TXT
 * values are generated per-domain inside Resend.
 */
export default function DeliverabilityDocsPage() {
    return (
        <main className="mx-auto max-w-2xl px-4 sm:px-6">
            <section className="space-y-3 py-10 sm:py-14">
                <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
                    Email deliverability
                </h1>
                <p className="text-muted-foreground leading-relaxed">
                    Landing in the inbox (not spam) comes down to authenticating your
                    sending domain. This guide walks through the three DNS records every
                    sender needs — <strong>SPF</strong>, <strong>DKIM</strong>, and{" "}
                    <strong>DMARC</strong> — plus how to verify them in Resend and warm up a
                    new domain.
                </p>
            </section>

            <section className="space-y-4">
                <div className="rounded-2xl border bg-card p-5 shadow-sm sm:p-6">
                    <h2 className="font-semibold">1. Add &amp; verify your domain in Resend</h2>
                    <p className="mt-1 text-sm text-muted-foreground leading-relaxed">
                        Before anything else, add your sending domain in the Resend
                        dashboard (<em>Domains → Add Domain</em>). Resend generates a set of
                        DNS records unique to your domain — you copy those into your DNS
                        provider (Cloudflare, Namecheap, Route&nbsp;53, etc.), then click{" "}
                        <em>Verify</em>. Send from a subdomain like{" "}
                        <code>mail.yourdomain.com</code> or <code>send.yourdomain.com</code>{" "}
                        so your root domain&apos;s reputation stays independent.
                    </p>
                    <p className="mt-3">
                        <a
                            href="https://resend.com/domains"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[#ff5c5c] underline underline-offset-4"
                        >
                            Open Resend → Domains
                        </a>
                    </p>
                </div>

                <div className="rounded-2xl border bg-card p-5 shadow-sm sm:p-6">
                    <h2 className="font-semibold">2. SPF — authorize who can send</h2>
                    <p className="mt-1 text-sm text-muted-foreground leading-relaxed">
                        SPF (Sender Policy Framework) is a TXT record listing which servers
                        are allowed to send mail for your domain. Resend gives you an SPF
                        (or MX + SPF) record to add. It looks roughly like:
                    </p>
                    <pre className="mt-3 overflow-x-auto rounded-lg bg-muted p-3 text-xs">
                        <code>{`Type:  TXT
Name:  send  (or the subdomain Resend shows)
Value: v=spf1 include:amazonses.com ~all`}</code>
                    </pre>
                    <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
                        <strong>Gotcha:</strong> a domain may have only <em>one</em> SPF
                        record. If you already send through another provider, merge the{" "}
                        <code>include:</code> mechanisms into a single record rather than
                        adding a second SPF line.
                    </p>
                </div>

                <div className="rounded-2xl border bg-card p-5 shadow-sm sm:p-6">
                    <h2 className="font-semibold">3. DKIM — cryptographically sign your mail</h2>
                    <p className="mt-1 text-sm text-muted-foreground leading-relaxed">
                        DKIM (DomainKeys Identified Mail) attaches a signature that proves
                        the message wasn&apos;t tampered with and really came from your
                        domain. Resend provides one or more CNAME (or TXT) records — add all
                        of them exactly as shown:
                    </p>
                    <pre className="mt-3 overflow-x-auto rounded-lg bg-muted p-3 text-xs">
                        <code>{`Type:  CNAME
Name:  resend._domainkey  (Resend shows the exact host)
Value: <the target Resend gives you>`}</code>
                    </pre>
                    <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
                        Don&apos;t let your DNS provider append the domain twice (some auto-add
                        it to the <em>Name</em> field). DKIM is the single most important
                        record for inbox placement.
                    </p>
                </div>

                <div className="rounded-2xl border bg-card p-5 shadow-sm sm:p-6">
                    <h2 className="font-semibold">4. DMARC — set a policy &amp; get reports</h2>
                    <p className="mt-1 text-sm text-muted-foreground leading-relaxed">
                        DMARC tells receiving servers what to do when SPF/DKIM fail, and
                        where to send aggregate reports. Add a TXT record on{" "}
                        <code>_dmarc.yourdomain.com</code>. Start relaxed, then tighten:
                    </p>
                    <pre className="mt-3 overflow-x-auto rounded-lg bg-muted p-3 text-xs">
                        <code>{`Type:  TXT
Name:  _dmarc
Value: v=DMARC1; p=none; rua=mailto:dmarc@yourdomain.com; fo=1`}</code>
                    </pre>
                    <ul className="mt-3 space-y-1.5 text-sm text-muted-foreground">
                        <li>
                            <code>p=none</code> — monitor only (start here for a week or two).
                        </li>
                        <li>
                            <code>p=quarantine</code> — send failures to spam once you&apos;ve
                            confirmed alignment.
                        </li>
                        <li>
                            <code>p=reject</code> — the goal: reject unauthenticated mail.
                        </li>
                    </ul>
                    <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
                        Gmail and Yahoo now <strong>require</strong> a DMARC record for bulk
                        senders, so don&apos;t skip this one.
                    </p>
                </div>

                <div className="rounded-2xl border bg-card p-5 shadow-sm sm:p-6">
                    <h2 className="font-semibold">5. Verify everything</h2>
                    <ul className="mt-2 space-y-1.5 text-sm text-muted-foreground">
                        <li>
                            In Resend, the domain should show a green{" "}
                            <strong>Verified</strong> status once DNS propagates (can take up
                            to ~48h, usually minutes).
                        </li>
                        <li>
                            Send a test to{" "}
                            <a
                                href="https://www.mail-tester.com"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[#ff5c5c] underline underline-offset-4"
                            >
                                mail-tester.com
                            </a>{" "}
                            for a 0–10 spam score with a per-record breakdown.
                        </li>
                        <li>
                            In Gmail, open a received test → <em>Show original</em> → confirm
                            SPF, DKIM, and DMARC all say <strong>PASS</strong>.
                        </li>
                    </ul>
                </div>

                <div className="rounded-2xl border bg-card p-5 shadow-sm sm:p-6">
                    <h2 className="font-semibold">6. Inbox-placement pitfalls</h2>
                    <ul className="mt-2 space-y-1.5 text-sm text-muted-foreground">
                        <li>
                            <strong>No plaintext part.</strong> Always send a multipart email
                            (HTML + text). PhluentLabs already does this.
                        </li>
                        <li>
                            <strong>Spammy content.</strong> Avoid ALL-CAPS subjects, excessive
                            <code> !!! </code>, link shorteners, and image-only emails.
                        </li>
                        <li>
                            <strong>Missing unsubscribe.</strong> A visible unsubscribe link
                            (and a list-unsubscribe header) is required for bulk mail — ours
                            is built in.
                        </li>
                        <li>
                            <strong>Sending to stale lists.</strong> High bounce/complaint
                            rates tank reputation. Use double opt-in (the default here) and
                            prune hard bounces.
                        </li>
                        <li>
                            <strong>Cold domain.</strong> Never blast a brand-new domain — see
                            warm-up below.
                        </li>
                    </ul>
                </div>

                <div className="rounded-2xl border bg-card p-5 shadow-sm sm:p-6">
                    <h2 className="font-semibold">7. Warm up a new domain</h2>
                    <p className="mt-1 text-sm text-muted-foreground leading-relaxed">
                        Mailbox providers distrust sudden volume from an unknown domain.
                        Ramp gradually over 2–4 weeks: start with your most-engaged
                        subscribers (recent confirms, frequent openers) and grow volume
                        steadily, watching bounce and complaint rates. Consistent cadence
                        and strong early engagement build reputation faster than raw volume.
                    </p>
                </div>
            </section>

            <section className="text-muted-foreground space-y-2 py-10 text-sm">
                <p>
                    Managing PhluentLabs? Admins can see the configured sending domain and
                    quick links in the{" "}
                    <a
                        href="/admin/deliverability"
                        className="text-[#ff5c5c] underline underline-offset-4"
                    >
                        deliverability panel
                    </a>
                    .
                </p>
                <p>
                    Building an integration? See the{" "}
                    <a
                        href="/docs/api"
                        className="text-[#ff5c5c] underline underline-offset-4"
                    >
                        subscribe API docs
                    </a>
                    .
                </p>
            </section>
        </main>
    );
}
