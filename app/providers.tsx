"use client"

import {ReactNode, useState} from "react";
import {QueryClient} from "@tanstack/query-core";
import {trpc} from "@/trpc/client";
import superjson from "superjson";
import {httpBatchLink} from "@trpc/client";
import {QueryClientProvider} from "@tanstack/react-query";

export const Providers = ({ children }: { children: ReactNode }) => {
    const [queryClient] = useState(() => new QueryClient());
    const [trpcClient] = useState(() => trpc.createClient({
        links: [
            httpBatchLink({
                transformer: superjson,
                url: "/api/trpc"
            }),
        ],
    }));

    return (
        <trpc.Provider client={trpcClient} queryClient={queryClient}>
            <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
        </trpc.Provider>
    )
}