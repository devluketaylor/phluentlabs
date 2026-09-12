import { NextResponse } from "next/server";
import { Webhook } from "svix";
import { db } from "@/db/client";
import { newsletterRecipients } from "@/db/schemas/newsletter-recipients";
import { subscribers } from "@/db/schemas/subscribers";
import { and, eq, inArray, sql } from "drizzle-orm";

// Public, UNAUTHENTICATED endpoint that Resend calls with delivery/engagement
// events. It is signature-gated: Resend signs each webhook with Svix, and we
// verify that signature against RESEND_WEBHOOK_SECRET before trusting anything.
// A bad/missing signature returns 400; a handled event returns 200.
//
// Resend event types handled:
//   email.sent               -> (recipient row already exists from send path)
//   email.delivered          -> stamp deliveredAt
//   email.delivery_delayed   -> (informational; no state change)
//   email.bounced            -> stamp bouncedAt + mark status "bounced";
//                               a HARD (permanent) bounce ALSO auto-suppresses
//                               the subscriber (status "suppressed") so we stop
//                               mailing a dead address.
//   email.complained         -> stamp complainedAt + mark status "complained";
//                               a spam complaint ALSO auto-suppresses the
//                               subscriber (best practice: never email again).
//
// Auto-suppression: a "suppressed" subscriber status is a new free-form status
// value (no schema change — mirrors how "paused" was added). The send audience
// only targets status = "subscribed", so a suppressed subscriber is excluded
// from all future sends automatically. We only auto-suppress from an ACTIVE
// state (subscribed/pending) so we never clobber an explicit unsubscribe or a
// prior suppression.  Soft/transient bounces do NOT suppress.
//   email.opened             -> first-open timestamp + increment openCount
//   email.clicked            -> increment clickCount + record last URL
//
// Idempotency: every event carries a Svix message id (svix-id header) and
// Resend includes its own event created_at. We store the last processed event
// id on the recipient row (lastEventId) and skip re-processing the same id, so
// a webhook redelivery can't double-count opens/clicks or re-stamp timestamps.

// Resend's webhook payload shape (subset we use).
type ResendWebhookEvent = {
    type: string;
    created_at?: string;
    data?: {
        email_id?: string;
        // Present on email.clicked
        click?: { link?: string; url?: string };
        // Some payloads nest the link differently; be defensive.
        link?: { url?: string };
        // Present on email.bounced — Resend classifies the bounce. We treat a
        // "Permanent"/"hard" bounce as a dead address worth suppressing; a
        // "Transient"/"soft" bounce is temporary and does NOT suppress. Be
        // defensive about where the classification lives across payload shapes.
        bounce?: { type?: string; subType?: string; message?: string };
        type?: string;
        subType?: string;
    };
};

// Decide whether a bounce payload represents a HARD/permanent bounce (suppress)
// vs a soft/transient one (leave the subscriber active). Defaults to NOT
// suppressing when the classification is missing/unknown — safer to keep a
// subscriber than to wrongly suppress on an ambiguous soft bounce.
function isHardBounce(data: ResendWebhookEvent["data"]): boolean {
    const raw = (
        data?.bounce?.type ??
        data?.bounce?.subType ??
        data?.type ??
        data?.subType ??
        ""
    )
        .toString()
        .toLowerCase();
    if (!raw) return false;
    // Anything explicitly transient/soft/temporary is NOT a hard bounce.
    if (raw.includes("transient") || raw.includes("soft") || raw.includes("temporary")) {
        return false;
    }
    // Only suppress when the payload explicitly says permanent/hard.
    return raw.includes("permanent") || raw.includes("hard");
}

// Flip a subscriber to "suppressed", but ONLY from an active state
// (subscribed/pending) so we never override an explicit unsubscribe or an
// already-suppressed row. No-op if the subscriber can't be resolved.
async function suppressSubscriber(subscriberId: string | null | undefined) {
    if (!subscriberId) return;
    await db
        .update(subscribers)
        .set({ status: "suppressed", updatedAt: new Date() })
        .where(
            and(
                eq(subscribers.id, subscriberId),
                inArray(subscribers.status, ["subscribed", "pending", "paused"]),
            ),
        );
}

export async function POST(request: Request) {
    const secret = process.env.RESEND_WEBHOOK_SECRET;
    if (!secret) {
        // Misconfiguration: fail closed rather than accept unverified writes.
        console.error("[resend-webhook] RESEND_WEBHOOK_SECRET is not set");
        return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
    }

    // Read the raw body EXACTLY as sent — Svix verifies the signature over the
    // raw bytes, so we must not JSON.parse before verifying.
    const payload = await request.text();
    const headers = {
        "svix-id": request.headers.get("svix-id") ?? "",
        "svix-timestamp": request.headers.get("svix-timestamp") ?? "",
        "svix-signature": request.headers.get("svix-signature") ?? "",
    };

    let event: ResendWebhookEvent;
    try {
        const wh = new Webhook(secret);
        // Throws if the signature is missing/invalid or timestamp is out of
        // tolerance. Returns the verified, parsed JSON payload.
        event = wh.verify(payload, headers) as ResendWebhookEvent;
    } catch {
        return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
    }

    const svixId = headers["svix-id"];
    const emailId = event.data?.email_id;
    const type = event.type;

    // Events without an email id (or an unknown type) can't be mapped to a
    // recipient row — acknowledge so Resend doesn't retry forever.
    if (!emailId) {
        return NextResponse.json({ ok: true, ignored: "no-email-id" });
    }

    // Locate the per-recipient row this event belongs to via the stored
    // Resend email id (captured at send time as resendId).
    const [recipient] = await db
        .select()
        .from(newsletterRecipients)
        .where(eq(newsletterRecipients.resendId, emailId));

    if (!recipient) {
        // Not one of ours (e.g. a test/confirm email). Acknowledge.
        return NextResponse.json({ ok: true, ignored: "no-recipient" });
    }

    // Idempotency: if we've already processed this exact Svix message id for
    // this recipient, do nothing (redelivery).
    if (svixId && recipient.lastEventId === svixId) {
        return NextResponse.json({ ok: true, idempotent: true });
    }

    const now = new Date();
    // Prefer Resend's event timestamp when present, else now.
    const eventAt = event.created_at ? new Date(event.created_at) : now;

    switch (type) {
        case "email.delivered": {
            await db
                .update(newsletterRecipients)
                .set({
                    // Only set the FIRST delivered timestamp (idempotent even if
                    // lastEventId somehow missed a dup).
                    ...(recipient.deliveredAt ? {} : { deliveredAt: eventAt }),
                    lastEventId: svixId || recipient.lastEventId,
                })
                .where(eq(newsletterRecipients.id, recipient.id));
            break;
        }
        case "email.opened": {
            await db
                .update(newsletterRecipients)
                .set({
                    ...(recipient.openedAt ? {} : { openedAt: eventAt }),
                    openCount: sql`${newsletterRecipients.openCount} + 1`,
                    lastEventId: svixId || recipient.lastEventId,
                })
                .where(eq(newsletterRecipients.id, recipient.id));
            break;
        }
        case "email.clicked": {
            const url =
                event.data?.click?.link ??
                event.data?.click?.url ??
                event.data?.link?.url ??
                null;
            await db
                .update(newsletterRecipients)
                .set({
                    ...(recipient.clickedAt ? {} : { clickedAt: eventAt }),
                    clickCount: sql`${newsletterRecipients.clickCount} + 1`,
                    ...(url ? { lastClickedUrl: url } : {}),
                    lastEventId: svixId || recipient.lastEventId,
                })
                .where(eq(newsletterRecipients.id, recipient.id));
            break;
        }
        case "email.bounced": {
            await db
                .update(newsletterRecipients)
                .set({
                    ...(recipient.bouncedAt ? {} : { bouncedAt: eventAt }),
                    status: "bounced",
                    lastEventId: svixId || recipient.lastEventId,
                })
                .where(eq(newsletterRecipients.id, recipient.id));
            // Auto-suppress the subscriber on a HARD (permanent) bounce only —
            // the address is dead and shouldn't be mailed again. Soft/transient
            // bounces are temporary, so we leave the subscriber active.
            if (isHardBounce(event.data)) {
                await suppressSubscriber(recipient.subscriberId);
            }
            break;
        }
        case "email.complained": {
            await db
                .update(newsletterRecipients)
                .set({
                    ...(recipient.complainedAt ? {} : { complainedAt: eventAt }),
                    status: "complained",
                    lastEventId: svixId || recipient.lastEventId,
                })
                .where(eq(newsletterRecipients.id, recipient.id));
            // A spam complaint is unambiguous — always auto-suppress so we never
            // email this person again (protects deliverability/reputation).
            await suppressSubscriber(recipient.subscriberId);
            break;
        }
        case "email.sent":
        case "email.delivery_delayed": {
            // Informational — no state change beyond recording that we've seen
            // this event id (so a redelivery is a no-op).
            await db
                .update(newsletterRecipients)
                .set({ lastEventId: svixId || recipient.lastEventId })
                .where(eq(newsletterRecipients.id, recipient.id));
            break;
        }
        default: {
            // Unknown event type — acknowledge without changing state.
            return NextResponse.json({ ok: true, ignored: `unhandled:${type}` });
        }
    }

    return NextResponse.json({ ok: true, type });
}
