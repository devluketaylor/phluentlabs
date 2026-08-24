import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { newsletters } from "@/db/schemas/newsletters";
import { and, eq, lte } from "drizzle-orm";
import { sendNewsletterToSubscribers } from "@/lib/send-newsletter";

// Fires due scheduled newsletters. Intended to be called by Vercel Cron.
// Protected by CRON_SECRET (Vercel sends it as a Bearer token automatically
// for configured cron jobs) or a matching NEWSLETTER_API_KEY.
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

    const due = await db
        .select({ id: newsletters.id })
        .from(newsletters)
        .where(and(eq(newsletters.status, "scheduled"), lte(newsletters.scheduledAt, new Date())));

    const results: Array<{ id: string; sent: number; error?: string }> = [];
    for (const n of due) {
        try {
            const { sent } = await sendNewsletterToSubscribers(n.id);
            results.push({ id: n.id, sent });
        } catch (e) {
            results.push({ id: n.id, sent: 0, error: e instanceof Error ? e.message : "failed" });
        }
    }

    return NextResponse.json({ ok: true, processed: results.length, results });
}
