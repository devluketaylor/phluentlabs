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
import { adminSavedSegmentsRouter } from "@/trpc/routers/admin-saved-segments";
import { ideaLabRouter } from "@/trpc/routers/idea-lab";
import { usageRouter } from "@/trpc/routers/usage";
import { adminPortfolioRouter } from "@/trpc/routers/admin-portfolio";
import { portfolioPublicRouter } from "@/trpc/routers/portfolio-public";

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
    adminSavedSegments: adminSavedSegmentsRouter,
    ideaLab: ideaLabRouter,
    usage: usageRouter,
    newsletter: newsletterRouter,
    adminPortfolio: adminPortfolioRouter,
    portfolioPublic: portfolioPublicRouter,
});

export type AppRouter = typeof appRouter;
