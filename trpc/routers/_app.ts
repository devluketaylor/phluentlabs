import { router } from "@/trpc/server";
import { subscribeRouter } from "@/trpc/routers/subscribe";
import { adminSubscribersRouter } from "@/trpc/routers/admin-subscribers";
import { adminNewsletterRouter, newsletterRouter } from "@/trpc/routers/newsletter";
import { adminDashboardRouter } from "@/trpc/routers/admin-dashboard";

export const appRouter = router({
    subscribe: subscribeRouter,
    adminSubscribers: adminSubscribersRouter,
    adminNewsletter: adminNewsletterRouter,
    adminDashboard: adminDashboardRouter,
    newsletter: newsletterRouter,
});

export type AppRouter = typeof appRouter;
