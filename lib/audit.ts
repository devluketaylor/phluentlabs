import { db } from "@/db/client";
import { auditLog } from "@/db/schemas/audit-log";

// Minimal shape recordAudit needs from a tRPC context: the db handle plus the
// acting admin's id/email (provided by adminProcedure's middleware). Kept loose
// so callers can pass the whole `ctx` without a type dance.
type AuditCtx = {
    db: typeof db;
    adminUserId?: string | null;
    adminEmail?: string | null;
};

export type AuditInput = {
    // "<entity>.<verb>", e.g. "subscriber.update" / "newsletter.send".
    action: string;
    targetType?: string | null;
    targetId?: string | null;
    // Free-form JSON context (changed fields, counts, audience size, …).
    // Never put secrets or full PII dumps here.
    metadata?: Record<string, unknown> | null;
};

// Append one row to the admin audit trail. This is intentionally best-effort:
// an audit-write failure must NEVER break the underlying admin action, so it
// swallows/logs errors instead of throwing. Call it from admin mutations AFTER
// the primary write succeeds.
export async function recordAudit(ctx: AuditCtx, input: AuditInput): Promise<void> {
    try {
        await ctx.db.insert(auditLog).values({
            id: crypto.randomUUID(),
            actorId: ctx.adminUserId ?? null,
            actorEmail: ctx.adminEmail ?? null,
            action: input.action,
            targetType: input.targetType ?? null,
            targetId: input.targetId ?? null,
            metadata: input.metadata ?? null,
        });
    } catch (err) {
        // Audit logging is non-critical; don't let it surface to the user.
        console.error("[audit] failed to record", input.action, err);
    }
}
