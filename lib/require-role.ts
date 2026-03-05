import {auth} from "@/lib/auth";
import {TRPCError} from "@trpc/server";

type Role = "admin" | "editor"

export const requireRole = async (headers: Headers, allowed: Role[] = ["admin"]) => {
    const session = await auth.api.getSession({ headers });

    if (!session?.user) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Not signed in" });
    }

    const role = (session.user as any).role as Role | undefined;

    if (!role || !allowed.includes(role)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Invalid role" });
    }

    return { session, user: session.user as any, role };
}