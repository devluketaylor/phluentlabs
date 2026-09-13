import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Subscribe API",
    description:
        "Programmatically subscribe people to PhluentLabs from any external site or tool using the public subscribe API.",
};

/**
 * Public docs for the subscribe API (POST /api/v1/subscribe). Lives inside the
 * (app) group so it gets the site chrome. Pure static content, no auth.
 */
export default function ApiDocsPage() {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://phluentlabs.com";
    const endpoint = `${appUrl.replace(/\/$/, "")}/api/v1/subscribe`;

    const curl = `curl -X POST ${endpoint} \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "email": "reader@example.com",
    "firstName": "Ada",
    "ref": "OPTIONAL_REFERRAL_CODE",
    "tags": ["source:partner-site"]
  }'`;

    return (
        <main className="mx-auto max-w-2xl px-4 sm:px-6">
            <section className="space-y-3 py-10 sm:py-14">
                <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Subscribe API</h1>
                <p className="text-muted-foreground leading-relaxed">
                    Enroll subscribers programmatically from any external site or tool. The
                    API reuses the same double opt-in flow as the on-site form: the person
                    still receives a confirmation email and must click to confirm, so a key
                    can never force-confirm anyone.
                </p>
            </section>

            <section className="space-y-4">
                <div className="rounded-2xl border bg-card p-5 shadow-sm sm:p-6">
                    <h2 className="font-semibold">Endpoint</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                        Send a JSON <code>POST</code> with a bearer API key.
                    </p>
                    <pre className="mt-3 overflow-x-auto rounded-lg bg-muted p-3 text-xs">
                        <code>
                            POST {endpoint}
                            {"\n"}Authorization: Bearer &lt;your api key&gt;
                            {"\n"}Content-Type: application/json
                        </code>
                    </pre>
                    <p className="mt-3 text-sm text-muted-foreground">
                        Create and manage keys in the admin panel under{" "}
                        <strong>API Keys</strong>. The raw key is shown only once at
                        creation — store it securely.
                    </p>
                </div>

                <div className="rounded-2xl border bg-card p-5 shadow-sm sm:p-6">
                    <h2 className="font-semibold">Request body</h2>
                    <ul className="mt-2 space-y-1.5 text-sm text-muted-foreground">
                        <li>
                            <code>email</code> <span className="text-primary">(required)</span> — the
                            subscriber&apos;s email address.
                        </li>
                        <li>
                            <code>firstName</code>, <code>lastName</code> (optional) — name fields.
                        </li>
                        <li>
                            <code>ref</code> (optional) — a referral code to credit a referrer;
                            unknown codes are ignored.
                        </li>
                        <li>
                            <code>tags</code> (optional) — an array of tags to apply to a
                            brand-new subscriber (e.g. where the signup came from).
                        </li>
                    </ul>
                </div>

                <div className="rounded-2xl border bg-card p-5 shadow-sm sm:p-6">
                    <h2 className="font-semibold">Example</h2>
                    <pre className="mt-3 overflow-x-auto rounded-lg bg-muted p-3 text-xs">
                        <code>{curl}</code>
                    </pre>
                </div>

                <div className="rounded-2xl border bg-card p-5 shadow-sm sm:p-6">
                    <h2 className="font-semibold">Responses</h2>
                    <ul className="mt-2 space-y-1.5 text-sm text-muted-foreground">
                        <li>
                            <code>200</code> — <code>{`{ "ok": true, "alreadySubscribed": false }`}</code>{" "}
                            a confirmation email was sent (or the email was already subscribed).
                        </li>
                        <li>
                            <code>400</code> — invalid body / missing or malformed email.
                        </li>
                        <li>
                            <code>401</code> — missing or invalid API key.
                        </li>
                        <li>
                            <code>429</code> — rate limit exceeded (slow down and retry).
                        </li>
                    </ul>
                </div>
            </section>

            <section className="text-muted-foreground space-y-2 py-10 text-sm">
                <p>
                    Prefer a no-code option? See the{" "}
                    <a href="/embed" className="text-primary underline underline-offset-4">
                        embeddable subscribe form
                    </a>
                    .
                </p>
                <p>
                    Making sure your emails land in the inbox? See the{" "}
                    <a href="/docs/deliverability" className="text-primary underline underline-offset-4">
                        deliverability guide
                    </a>
                    .
                </p>
            </section>
        </main>
    );
}
