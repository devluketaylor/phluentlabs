import { router } from "@/trpc/server";
import { subscribeRouter } from "@/trpc/routers/subscribe";
import { adminSubscribersRouter } from "@/trpc/routers/admin-subscribers";
import { adminNewsletterRouter, newsletterRouter } from "@/trpc/routers/newsletter";
import { adminDashboardRouter } from "@/trpc/routers/admin-dashboard";
import { adminAuditRouter } from "@/trpc/routers/admin-audit";
import { adminApiKeysRouter } from "@/trpc/routers/admin-api-keys";
import { adminTeamRouter } from "@/trpc/routers/admin-team";

export const appRouter = router({
    subscribe: subscribeRouter,
    adminSubscribers: adminSubscribersRouter,
    adminNewsletter: adminNewsletterRouter,
    adminDashboard: adminDashboardRouter,
    adminAudit: adminAuditRouter,
    adminApiKeys: adminApiKeysRouter,
    adminTeam: adminTeamRouter,
    newsletter: newsletterRouter,
});

export type AppRouter = typeof appRouter;
