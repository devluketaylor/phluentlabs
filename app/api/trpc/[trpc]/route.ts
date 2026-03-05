import {fetchRequestHandler} from "@trpc/server/adapters/fetch";
import {appRouter} from "@/trpc/routers/_app";
import { createContext } from "@/trpc/server";

const handler = (req: Request) => fetchRequestHandler({ endpoint: "/api/trpc", req, router: appRouter, createContext: () => createContext({ headers: req.headers }) });

export { handler as GET, handler as POST };