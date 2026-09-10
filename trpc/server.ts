import {initTRPC, TRPCError} from "@trpc/server";
import superjson from "superjson";
import {db} from "@/db/client";
import {auth} from "@/lib/auth";
import {type AdminRole, hasRoleAtLeast, normalizeRole} from "@/lib/roles";

export type Context = {
    db: typeof db;
    headers: Headers;
};

export const createContext = async (opts: { headers: Headers }): Promise<Context> => {
    return { db, headers: opts.headers };
}

const t = initTRPC.context<Context>().create({
    transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

const adminMiddleware = t.middleware(async ({ ctx, next }) => {
    const session = await auth.api.getSession({ headers: ctx.headers });

    if (!session?.user) {
        throw new TRPCError({ code: "UNAUTHORIZED" });
    }

    const rawRole = (session.user as any).role;
    const roles = (session.user as any).roles as string[] | undefined;
    // Resolve the effective admin role. Support the legacy single-tier setup
    // (role "admin") and the multi-role hierarchy (owner/admin/editor/viewer),
    // including a possible `roles[]` array from better-auth's admin plugin.
    let adminRole = normalizeRole(rawRole);
    if (!adminRole && Array.isArray(roles)) {
        for (const r of roles) {
            const n = normalizeRole(r);
            if (n && (!adminRole || hasRoleAtLeast(n, adminRole))) adminRole = n;
        }
    }

    if (!adminRole) {
        throw new TRPCError({ code: "FORBIDDEN" });
    }

    return next({
        ctx: {
            ...ctx,
            adminUserId: session.user.id,
            adminRole: adminRole as AdminRole,
            // Denormalized actor email snapshot for the audit log (see recordAudit).
            adminEmail: (session.user as any).email as string | undefined,
        }
    })
})

// Base admin procedure: any admin-area role (owner/admin/editor/viewer) passes.
export const adminProcedure = t.procedure.use(adminMiddleware);

// Build a procedure that additionally requires at least `min` role rank.
export const roleProcedure = (min: AdminRole) =>
    adminProcedure.use(async ({ ctx, next }) => {
        if (!hasRoleAtLeast((ctx as any).adminRole, min)) {
            throw new TRPCError({
                code: "FORBIDDEN",
                message: `This action requires the ${min} role or higher.`,
            });
        }
        return next({ ctx });
    });

// Convenience procedures for common tiers.
export const editorProcedure = roleProcedure("editor");
export const ownerProcedure = roleProcedure("owner");