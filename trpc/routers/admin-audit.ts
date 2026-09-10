import { adminProcedure, router } from "@/trpc/server";
import { z } from "zod";
import { and, count, desc, eq, sql } from "drizzle-orm";
import { auditLog } from "@/db/schemas/audit-log";

// Read-only admin audit trail. Rows are written by recordAudit() from the admin
// mutations; this router only ever reads them (no create/update/delete here).
export const adminAuditRouter = router({
    // Paginated, newest-first list with optional action/actor filters.
    list: adminProcedure
        .input(
            z.object({
                action: z.string().min(1).optional(),
                actorId: z.string().min(1).optional(),
                limit: z.number().int().min(1).max(200).default(50),
                offset: z.number().int().min(0).default(0),
            })
        )
        .query(async ({ input, ctx }) => {
            const parts = [];
            if (input.action) parts.push(eq(auditLog.action, input.action));
            if (input.actorId) parts.push(eq(auditLog.actorId, input.actorId));
            const where = parts.length ? and(...parts) : undefined;

            const [rows, totalRow] = await Promise.all([
                ctx.db
                    .select()
                    .from(auditLog)
                    .where(where)
                    .orderBy(desc(auditLog.createdAt))
                    .limit(input.limit)
                    .offset(input.offset),
                ctx.db.select({ total: count() }).from(auditLog).where(where),
            ]);

            return { rows, total: totalRow[0]?.total ?? 0 };
        }),

    // Distinct actions currently present, for the action filter dropdown.
    actions: adminProcedure.query(async ({ ctx }) => {
        const rows = await ctx.db
            .select({ action: auditLog.action, count: count() })
            .from(auditLog)
            .groupBy(auditLog.action)
            .orderBy(auditLog.action);
        return { actions: rows.map((r) => ({ action: r.action, count: Number(r.count) })) };
    }),

    // Distinct actors (id + email snapshot) currently present, for the actor
    // filter dropdown. Uses the most recent email seen per actor id.
    actors: adminProcedure.query(async ({ ctx }) => {
        const rows = await ctx.db.execute<{ actor_id: string; actor_email: string | null; c: number }>(sql`
            SELECT actor_id,
                   (array_agg(actor_email ORDER BY created_at DESC))[1] AS actor_email,
                   COUNT(*)::int AS c
            FROM ${auditLog}
            WHERE actor_id IS NOT NULL
            GROUP BY actor_id
            ORDER BY actor_email ASC NULLS LAST
        `);
        const list = (Array.isArray(rows) ? rows : (rows as any).rows ?? []) as {
            actor_id: string;
            actor_email: string | null;
            c: number;
        }[];
        return {
            actors: list.map((r) => ({
                actorId: r.actor_id,
                actorEmail: r.actor_email,
                count: Number(r.c),
            })),
        };
    }),
});
