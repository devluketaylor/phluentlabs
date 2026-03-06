import { router } from "@/trpc/server";
import { subscribeRouter } from "@/trpc/routers/subscribe";
import { adminSubscribersRouter } from "@/trpc/routers/admin-subscribers";
import { adminNewsletterRouter, newsletterRouter } from "@/trpc/routers/newsletter";

export const appRouter = router({
    subscribe: subscribeRouter,
    adminSubscribers: adminSubscribersRouter,
    adminNewsletter: adminNewsletterRouter,
    newsletter: newsletterRouter,
});

export type AppRouter = typeof appRouter;
