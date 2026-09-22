import { pgTable, text, timestamp, integer, boolean, index, uniqueIndex } from "drizzle-orm/pg-core";

// ── Portfolio content, DB-backed ──────────────────────────────────────────────
// These tables back Luke's personal portfolio site (luketaylor.io), edited from
// the "Portfolio" tab in this admin panel. The portfolio site itself is a
// SEPARATE Next.js app that consumes this content read-only via the public
// portfolio API (see trpc `portfolioPublic` router + /api/portfolio/*). Keeping
// the write surface here means one editor, one auth model, and image uploads via
// the existing UploadThing setup — while the portfolio stays a dumb consumer
// that never holds DB creds.
//
// Strictly additive: three standalone tables, no FK into the newsletter schema.

// Blog posts. Body is Tiptap HTML (same editor/markup the newsletter authoring
// surface uses), so the portfolio renders it directly. `published` gates public
// visibility; `slug` is the public URL segment and is unique.
export const portfolioPosts = pgTable(
    "portfolio_post",
    {
        id: text("id").primaryKey(),
        // Public URL segment, e.g. "hello-world". Unique, lowercased at the API layer.
        slug: text("slug").notNull(),
        title: text("title").notNull(),
        // One-line summary for cards, meta description, and OG.
        description: text("description"),
        // Body HTML authored in Tiptap. Length-capped at the API layer.
        body: text("body").notNull().default(""),
        // Optional cover image (UploadThing URL).
        coverImage: text("cover_image"),
        // Comma-free tag list stored as newline-joined text; parsed to array at API.
        // Kept as text (not a pg array) to match the additive/simple convention here.
        tags: text("tags").notNull().default(""),
        // Draft vs live. Only published posts are exposed by the public API.
        published: boolean("published").default(false).notNull(),
        // Authored publish date (may differ from createdAt for backdated posts).
        publishedAt: timestamp("published_at"),
        createdAt: timestamp("created_at").defaultNow().notNull(),
        updatedAt: timestamp("updated_at").defaultNow().notNull(),
    },
    (t) => [
        // Unique public slug.
        uniqueIndex("portfolio_post_slug_idx").on(t.slug),
        // Newest-first admin listing + public feed ordering.
        index("portfolio_post_published_at_idx").on(t.publishedAt),
        index("portfolio_post_created_at_idx").on(t.createdAt),
    ],
);

// Projects grid on the portfolio. Data-driven cards: title, blurb, links, tech.
export const portfolioProjects = pgTable(
    "portfolio_project",
    {
        id: text("id").primaryKey(),
        title: text("title").notNull(),
        description: text("description").notNull().default(""),
        // Optional external links.
        repoUrl: text("repo_url"),
        liveUrl: text("live_url"),
        // Optional cover/thumbnail (UploadThing URL).
        image: text("image"),
        // Tech stack, newline-joined text; parsed to array at API.
        tech: text("tech").notNull().default(""),
        // Featured projects surface first / on the home page.
        featured: boolean("featured").default(false).notNull(),
        // Hide without deleting.
        published: boolean("published").default(true).notNull(),
        // Manual ordering (lower = earlier). Ties break by createdAt.
        sortOrder: integer("sort_order").default(0).notNull(),
        createdAt: timestamp("created_at").defaultNow().notNull(),
        updatedAt: timestamp("updated_at").defaultNow().notNull(),
    },
    (t) => [
        index("portfolio_project_sort_idx").on(t.sortOrder),
        index("portfolio_project_created_at_idx").on(t.createdAt),
    ],
);

// Singleton-ish site settings (hero text, about, socials). We store a single
// row keyed by a fixed id ("default"); the API upserts it. Additive + defaulted
// so the row can be created lazily on first save.
export const portfolioSettings = pgTable("portfolio_settings", {
    id: text("id").primaryKey(),
    heroTitle: text("hero_title").notNull().default(""),
    heroSubtitle: text("hero_subtitle").notNull().default(""),
    // About-page body HTML (Tiptap).
    aboutHtml: text("about_html").notNull().default(""),
    githubUrl: text("github_url"),
    twitterUrl: text("twitter_url"),
    linkedinUrl: text("linkedin_url"),
    email: text("email"),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
