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

    // CSV export of the audit trail honouring the same action/actor filters the
    // page exposes. Read-only aggregation over the audit_log table — no schema,
    // no PII beyond the actor email/action the admin already sees on-screen.
    // Cap at a generous bound so a huge trail can't blow up the response.
    exportCsv: adminProcedure
        .input(
            z.object({
                action: z.string().min(1).optional(),
                actorId: z.string().min(1).optional(),
            })
        )
        .query(async ({ input, ctx }) => {
            const parts = [];
            if (input.action) parts.push(eq(auditLog.action, input.action));
            if (input.actorId) parts.push(eq(auditLog.actorId, input.actorId));
            const where = parts.length ? and(...parts) : undefined;

            const rows = await ctx.db
                .select()
                .from(auditLog)
                .where(where)
                .orderBy(desc(auditLog.createdAt))
                .limit(50000);

            const escape = (val: unknown) => {
                const s = val == null ? "" : String(val);
                return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
            };
            const header = [
                "created_at",
                "actor_email",
                "actor_id",
                "action",
                "target_type",
                "target_id",
                "metadata",
            ];
            const lines = [header.join(",")];
            for (const r of rows) {
                const when =
                    r.createdAt instanceof Date
                        ? r.createdAt.toISOString()
                        : String(r.createdAt ?? "");
                lines.push(
                    [
                        escape(when),
                        escape(r.actorEmail),
                        escape(r.actorId),
                        escape(r.action),
                        escape(r.targetType),
                        escape(r.targetId),
                        escape(r.metadata == null ? "" : JSON.stringify(r.metadata)),
                    ].join(",")
                );
            }
            return { csv: lines.join("\n"), count: rows.length };
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
