import { adminProcedure, editorProcedure, router } from "@/trpc/server";
import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { savedSegments } from "@/db/schemas/saved-segments";
import { recordAudit } from "@/lib/audit";

// The subscribers-table filter spec a saved segment persists. Kept small +
// forward-compatible; stored as a JSON string in the `filter` text column.
const filterSpec = z.object({
    q: z.string().max(200).optional(),
    status: z.enum(["pending", "subscribed", "unsubscribed"]).optional(),
    tag: z.string().min(1).max(200).optional(),
});

export type SavedSegmentFilter = z.infer<typeof filterSpec>;

function parseFilter(raw: string): SavedSegmentFilter {
    try {
        const parsed = filterSpec.safeParse(JSON.parse(raw));
        return parsed.success ? parsed.data : {};
    } catch {
        return {};
    }
}

export const adminSavedSegmentsRouter = router({
    // List all saved segments, newest first, with the filter parsed back into
    // its structured shape for the UI. Read-only, any admin+.
    list: adminProcedure.query(async ({ ctx }) => {
        const rows = await ctx.db
            .select()
            .from(savedSegments)
            .orderBy(desc(savedSegments.createdAt));
        return {
            segments: rows.map((r) => ({
                id: r.id,
                name: r.name,
                filter: parseFilter(r.filter),
                createdAt: r.createdAt,
            })),
        };
    }),

    // Create a named saved view from the current filter combination. A segment
    // with no active filters (all fields empty) is rejected — there's nothing
    // to save. Audit-logged. editor+ (write).
    create: editorProcedure
        .input(
            z.object({
                name: z.string().min(1).max(80),
                filter: filterSpec,
            }),
        )
        .mutation(async ({ input, ctx }) => {
            const name = input.name.trim();
            if (!name) throw new Error("Name cannot be empty.");

            // Strip empty fields so we only persist meaningful filters.
            const cleaned: SavedSegmentFilter = {};
            if (input.filter.q && input.filter.q.trim()) cleaned.q = input.filter.q.trim();
            if (input.filter.status) cleaned.status = input.filter.status;
            if (input.filter.tag && input.filter.tag.trim()) cleaned.tag = input.filter.tag.trim();

            if (Object.keys(cleaned).length === 0) {
                throw new Error("Add at least one filter before saving a view.");
            }

            const id = crypto.randomUUID();
            await ctx.db.insert(savedSegments).values({
                id,
                name,
                filter: JSON.stringify(cleaned),
            });

            await recordAudit(ctx, {
                action: "savedSegment.create",
                targetType: "savedSegment",
                targetId: id,
                metadata: { name, filter: cleaned },
            });

            return { ok: true as const, id };
        }),

    // Delete a saved view. Audit-logged. editor+ (write).
    delete: editorProcedure
        .input(z.object({ id: z.string().min(1) }))
        .mutation(async ({ input, ctx }) => {
            await ctx.db.delete(savedSegments).where(eq(savedSegments.id, input.id));
            await recordAudit(ctx, {
                action: "savedSegment.delete",
                targetType: "savedSegment",
                targetId: input.id,
            });
            return { ok: true as const };
        }),
});
