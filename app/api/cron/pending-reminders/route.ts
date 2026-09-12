import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { sendPendingReminders } from "@/lib/pending-reminders";

// Sends the one-time double opt-in reminder to pending subscribers who never
// confirmed (N days after signup, once each). Intended to be called by Vercel
// Cron. Protected by CRON_SECRET (Vercel sends it as a Bearer token for
// configured cron jobs) or a matching NEWSLETTER_API_KEY — same auth shape as
// the send-scheduled cron.
export async function GET(request: Request) {
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;
    const apiKey = process.env.NEWSLETTER_API_KEY;

    const authorized =
        (cronSecret && authHeader === `Bearer ${cronSecret}`) ||
        (apiKey && authHeader === `Bearer ${apiKey}`);

    if (!authorized) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const result = await sendPendingReminders(db);
        return NextResponse.json({ ok: true, ...result });
    } catch (e) {
        return NextResponse.json(
            { ok: false, error: e instanceof Error ? e.message : "failed" },
            { status: 500 },
        );
    }
}
