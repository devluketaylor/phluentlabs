import { FormHeader } from "@/components/header";
import { ShieldCheck, ExternalLink } from "lucide-react";

/**
 * Admin deliverability helper. Read-only: surfaces the configured sending
 * address/domain (derived from RESEND_FROM_EMAIL — NOT a secret) and links out
 * to Resend domain status + the public deliverability guide. Never exposes the
 * API key or any secret. Server component so env is read server-side only.
 */
export default function DeliverabilityPage() {
    const rawFrom = process.env.RESEND_FROM_EMAIL ?? "";
    // Support both "name@domain" and "Display Name <name@domain>" forms.
    const match = rawFrom.match(/<([^>]+)>/);
    const address = (match ? match[1] : rawFrom).trim();
    const domain = address.includes("@") ? address.split("@").pop()! : "";
    const configured = address.length > 0;
    // The bare Resend sandbox address (not a real authenticated domain).
    const isSandbox = domain === "resend.dev";

    return (
        <div className="max-w-4xl mx-auto pt-12 pb-16 px-4">
            <div className="space-y-6">
                <FormHeader
                    icon={<ShieldCheck />}
                    title="Deliverability"
                    description="Authenticate your sending domain (SPF/DKIM/DMARC) so newsletters land in the inbox."
                />

                <div className="rounded-2xl border bg-card p-5 shadow-sm sm:p-6">
                    <h2 className="font-semibold">Sending address</h2>
                    {configured ? (
                        <>
                            <p className="mt-1 text-sm text-muted-foreground">
                                Newsletters and confirmation emails are sent from:
                            </p>
                            <p className="mt-2 font-mono text-sm break-all">{address}</p>
                            {domain && (
                                <p className="mt-3 text-sm text-muted-foreground">
                                    Sending domain:{" "}
                                    <span className="font-medium text-foreground">{domain}</span>
                                </p>
                            )}
                            {isSandbox ? (
                                <p className="mt-3 rounded-lg border border-[#ff5c5c]/40 bg-[#ff5c5c]/10 p-3 text-sm">
                                    You&apos;re using Resend&apos;s sandbox address
                                    (<code>resend.dev</code>), which can only deliver to your own
                                    verified address. Add and verify a real domain before sending
                                    to subscribers.
                                </p>
                            ) : (
                                <p className="mt-3 text-sm text-muted-foreground">
                                    Confirm SPF, DKIM, and DMARC are set up and verified for this
                                    domain in Resend (see the checklist below).
                                </p>
                            )}
                        </>
                    ) : (
                        <p className="mt-2 rounded-lg border border-[#ff5c5c]/40 bg-[#ff5c5c]/10 p-3 text-sm">
                            No sending address configured. Set the{" "}
                            <code>RESEND_FROM_EMAIL</code> environment variable to a verified
                            Resend domain address (e.g.{" "}
                            <code>PhluentLabs &lt;news@mail.yourdomain.com&gt;</code>).
                        </p>
                    )}
                </div>

                <div className="rounded-2xl border bg-card p-5 shadow-sm sm:p-6">
                    <h2 className="font-semibold">Quick links</h2>
                    <ul className="mt-3 space-y-2 text-sm">
                        <li>
                            <a
                                href="https://resend.com/domains"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 text-[#ff5c5c] underline underline-offset-4"
                            >
                                Resend → Domains (add / verify / status)
                                <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                        </li>
                        <li>
                            <a
                                href="https://www.mail-tester.com"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 text-[#ff5c5c] underline underline-offset-4"
                            >
                                mail-tester.com (spam-score a test send)
                                <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                        </li>
                        <li>
                            <a
                                href="/docs/deliverability"
                                className="text-[#ff5c5c] underline underline-offset-4"
                            >
                                Full SPF/DKIM/DMARC setup guide
                            </a>
                        </li>
                    </ul>
                </div>

                <div className="rounded-2xl border bg-card p-5 shadow-sm sm:p-6">
                    <h2 className="font-semibold">Checklist</h2>
                    <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                        <li>✓ Add your sending domain in Resend (use a subdomain like <code>mail.</code>).</li>
                        <li>✓ Add the SPF TXT record Resend provides (only one SPF record per domain).</li>
                        <li>✓ Add all DKIM CNAME/TXT records exactly as shown.</li>
                        <li>
                            ✓ Add a DMARC TXT record on <code>_dmarc</code> (start <code>p=none</code>,
                            tighten to <code>quarantine</code>/<code>reject</code>).
                        </li>
                        <li>✓ Verify the domain shows green in Resend; send a mail-tester test.</li>
                        <li>✓ Warm up a new domain gradually before full-volume sends.</li>
                    </ul>
                    <p className="mt-3 text-xs text-muted-foreground">
                        This panel reads configuration only — it never displays your API key or
                        any secret.
                    </p>
                </div>
            </div>
        </div>
    );
}
