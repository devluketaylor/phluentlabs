import { pgTable, text, timestamp, jsonb, index } from "drizzle-orm/pg-core";

// Append-only admin audit trail. Every admin-initiated mutation (subscriber
// create/update/delete/bulk, newsletter create/update/delete/send, tag changes)
// records a row here via the recordAudit() helper. Read-only in the UI; rows
// are never updated or deleted from application code.
export const auditLog = pgTable(
    "audit_log",
    {
        id: text("id").primaryKey(),
        // Who did it: the acting admin's user id + a denormalized email snapshot
        // (so the log stays readable even if the user row later changes/goes away).
        actorId: text("actor_id"),
        actorEmail: text("actor_email"),
        // What happened, e.g. "subscriber.update", "newsletter.send". Dotted
        // "<entity>.<verb>" convention so the UI can group/filter by action.
        action: text("action").notNull(),
        // What it happened to: a coarse type ("subscriber"/"newsletter"/"tag")
        // plus the target row id when there is a single one (bulk ops leave it
        // null and put the affected ids/count in metadata).
        targetType: text("target_type"),
        targetId: text("target_id"),
        // Free-form JSON diff / context (changed fields, counts, before/after,
        // audience size, etc.). Never store secrets or full PII dumps here.
        metadata: jsonb("metadata"),
        createdAt: timestamp("created_at").defaultNow().notNull(),
    },
    (t) => [
        // Newest-first listing + the two filter dimensions the UI exposes.
        index("audit_log_created_at_idx").on(t.createdAt),
        index("audit_log_action_idx").on(t.action),
        index("audit_log_actor_id_idx").on(t.actorId),
    ]
);
