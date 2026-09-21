import { router } from "@/trpc/server";
import { subscribeRouter } from "@/trpc/routers/subscribe";
import { adminSubscribersRouter } from "@/trpc/routers/admin-subscribers";
import { adminNewsletterRouter, newsletterRouter } from "@/trpc/routers/newsletter";
import { adminDashboardRouter } from "@/trpc/routers/admin-dashboard";
import { adminAuditRouter } from "@/trpc/routers/admin-audit";
import { adminApiKeysRouter } from "@/trpc/routers/admin-api-keys";
import { adminTeamRouter } from "@/trpc/routers/admin-team";
import { adminPublicationsRouter } from "@/trpc/routers/admin-publications";
import { adminContentBlocksRouter } from "@/trpc/routers/admin-content-blocks";
import { ideaLabRouter } from "@/trpc/routers/idea-lab";
import { usageRouter } from "@/trpc/routers/usage";

export const appRouter = router({
    subscribe: subscribeRouter,
    adminSubscribers: adminSubscribersRouter,
    adminNewsletter: adminNewsletterRouter,
    adminDashboard: adminDashboardRouter,
    adminAudit: adminAuditRouter,
    adminApiKeys: adminApiKeysRouter,
    adminTeam: adminTeamRouter,
    adminPublications: adminPublicationsRouter,
    adminContentBlocks: adminContentBlocksRouter,
    ideaLab: ideaLabRouter,
    usage: usageRouter,
    newsletter: newsletterRouter,
});

export type AppRouter = typeof appRouter;
