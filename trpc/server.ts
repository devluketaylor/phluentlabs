import {initTRPC, TRPCError} from "@trpc/server";
import superjson from "superjson";
import {db} from "@/db/client";
import {auth} from "@/lib/auth";

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

    const role = (session.user as any).role;
    const roles = (session.user as any).roles as string[] | undefined;
    const isAdmin = role === "admin" || (Array.isArray(roles) && roles.includes("admin"));

    if (!isAdmin) {
        throw new TRPCError({ code: "FORBIDDEN" });
    }

    return next({
        ctx: {
            ...ctx,
            adminUserId: session.user.id,
        }
    })
})

export const adminProcedure = t.procedure.use(adminMiddleware);