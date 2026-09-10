import { adminProcedure, router } from "@/trpc/server";
import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { apiKeys } from "@/db/schemas/api-keys";
import { generateApiKey, hashApiKey, keyDisplayPrefix } from "@/lib/api-key";
import { recordAudit } from "@/lib/audit";
import { TRPCError } from "@trpc/server";

// Admin management for public-subscribe-API keys. The raw key is generated
// server-side, hashed, and stored as a hash only; the plaintext is returned to
// the caller EXACTLY ONCE (on create) and never again.
export const adminApiKeysRouter = router({
    // Newest-first list of keys. Never returns the hash or the raw key — only
    // display-safe fields (label, prefix, timestamps, revoked state).
    list: adminProcedure.query(async ({ ctx }) => {
        const rows = await ctx.db
            .select({
                id: apiKeys.id,
                label: apiKeys.label,
                prefix: apiKeys.prefix,
                createdAt: apiKeys.createdAt,
                lastUsedAt: apiKeys.lastUsedAt,
                revokedAt: apiKeys.revokedAt,
            })
            .from(apiKeys)
            .orderBy(desc(apiKeys.createdAt));
        return { rows };
    }),

    // Create a new key. Returns the raw key ONCE — the UI must surface it
    // immediately and warn the admin it won't be shown again.
    create: adminProcedure
        .input(z.object({ label: z.string().trim().min(1).max(120) }))
        .mutation(async ({ input, ctx }) => {
            const raw = generateApiKey();
            const keyHash = await hashApiKey(raw);
            const prefix = keyDisplayPrefix(raw);
            const id = crypto.randomUUID();

            await ctx.db.insert(apiKeys).values({
                id,
                label: input.label,
                keyHash,
                prefix,
            });

            await recordAudit(ctx, {
                action: "apiKey.create",
                targetType: "apiKey",
                targetId: id,
                metadata: { label: input.label, prefix },
            });

            // The ONLY time the raw key is ever exposed.
            return { id, label: input.label, prefix, key: raw };
        }),

    // Soft-revoke a key: it stays in the table (for the audit trail) but is
    // rejected by the public API from now on. Idempotent.
    revoke: adminProcedure
        .input(z.object({ id: z.string().min(1) }))
        .mutation(async ({ input, ctx }) => {
            const [existing] = await ctx.db
                .select({ id: apiKeys.id, label: apiKeys.label, revokedAt: apiKeys.revokedAt })
                .from(apiKeys)
                .where(eq(apiKeys.id, input.id));
            if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "API key not found" });

            if (!existing.revokedAt) {
                await ctx.db
                    .update(apiKeys)
                    .set({ revokedAt: new Date() })
                    .where(eq(apiKeys.id, input.id));
            }

            await recordAudit(ctx, {
                action: "apiKey.revoke",
                targetType: "apiKey",
                targetId: input.id,
                metadata: { label: existing.label },
            });

            return { ok: true };
        }),
});
