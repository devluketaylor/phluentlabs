import { pgTable, text, timestamp, index } from "drizzle-orm/pg-core";

// API keys for the public subscribe API. External sites/tools authenticate a
// `POST /api/v1/subscribe` call with `Authorization: Bearer <raw key>`.
//
// SECURITY: we store ONLY a SHA-256 hash of the raw key (never the raw key
// itself). The raw key is shown to the admin exactly once, at creation time.
// A short, non-secret `prefix` is stored in the clear so the admin can tell
// keys apart in the UI without ever revealing the secret. Lookups are by hash,
// and the comparison happens in Postgres on the hashed value (the raw key is
// never logged).
export const apiKeys = pgTable(
    "api_key",
    {
        id: text("id").primaryKey(),
        // Human label so the admin remembers what a key is for.
        label: text("label").notNull(),
        // SHA-256 hex of the raw key. Unique so a lookup resolves to one key.
        keyHash: text("key_hash").notNull().unique(),
        // First few visible chars of the raw key (e.g. "pk_live_ab12"). NOT a
        // secret — only for display/disambiguation in the admin UI.
        prefix: text("prefix").notNull(),
        createdAt: timestamp("created_at").defaultNow().notNull(),
        // Last time the key was used to authenticate a request (best-effort).
        lastUsedAt: timestamp("last_used_at"),
        // Soft-revoke: a revoked key is rejected but kept for the audit trail.
        revokedAt: timestamp("revoked_at"),
    },
    (t) => [
        index("api_key_created_at_idx").on(t.createdAt),
    ]
);
