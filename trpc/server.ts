import { initTRPC } from "@trpc/server";
import superjson from "superjson";
import {db} from "@/db/client";

export type Context = {
    db: typeof db;
};

export const createContext = async (): Promise<Context> => {
    return { db };
}

const t = initTRPC.context<Context>().create({
    transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;