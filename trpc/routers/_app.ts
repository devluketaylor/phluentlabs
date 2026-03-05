import {publicProcedure, router} from "@/trpc/server";
import {z} from "zod";
import {subscribeRouter} from "@/trpc/routers/subscribe";

export const appRouter = router({
    subscribe: subscribeRouter,
});

export type AppRouter = typeof appRouter;