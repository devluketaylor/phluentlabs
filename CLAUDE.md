# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development
npm run dev          # Start dev server at localhost:3000
npm run build        # Production build
npm run lint         # ESLint

# Database (Drizzle + PostgreSQL)
npm run db:generate  # Generate migrations from schema changes
npm run db:migrate   # Apply pending migrations
npm run db:studio    # Open Drizzle Studio UI
```

No test runner is configured.

## Architecture

This is a Next.js 16 app (App Router) with tRPC, Drizzle ORM, Better Auth, and Tailwind CSS v4.

### Route Groups
- `app/(app)/` — Public-facing site: homepage, `/confirm`, `/unsubscribe`
- `app/(auth)/` — Login/signup pages
- `app/(admin)/admin/` — Admin dashboard (server-side role check in layout redirects non-admins)

### tRPC Setup
- `trpc/server.ts` — Initializes tRPC with `publicProcedure` and `adminProcedure`. The `adminProcedure` middleware checks Better Auth session for `role === "admin"`.
- `trpc/routers/_app.ts` — Root router merging sub-routers
- `trpc/client.ts` — Client-side `createTRPCReact` instance
- `app/providers.tsx` — Wraps app with `trpc.Provider` + `QueryClientProvider`
- API endpoint: `app/api/trpc/[trpc]/route.ts`

### Auth (Better Auth)
- `lib/auth.ts` — Server-side auth config with Drizzle adapter and `admin` plugin
- `lib/auth-client.ts` — Client-side auth helpers
- `lib/require-role.ts` — Server utility for role-based access in tRPC procedures
- Schema tables in `db/schemas/auth.ts`
- Auth API route: `app/api/auth/[...all]/route.ts`

### Database (Drizzle + postgres.js)
- `db/client.ts` — Drizzle client using `DATABASE_URL` env var (SSL required)
- `db/schemas/` — Table definitions: `auth.ts`, `subscribers.ts`, `newsletters.ts`, `newsletter-recipients.ts`
- Migrations in `db/migrations/`

### Subscriber Flow
1. User submits subscribe form → `subscribe.request` mutation inserts with `status: "pending"`
2. Confirmation email sent via Resend with a signed JWT (`lib/subscriber-token.ts`, 24h expiry)
3. User clicks link → `/confirm` page calls `subscribe.confirm` → sets `status: "subscribed"`
4. Unsubscribe link uses a separate JWT with `scope: "unsub"` (30d expiry)

### UI Components
- `components/ui/` — shadcn/ui components (Button, Card, Form, Input, etc.)
- `components/admin/` — Admin-only components: `SubscribersTable`, `NewsletterRichEditor` (Tiptap)
- `components/forms/` — `SubscribeForm`, `LoginForm`, `SignupForm`
- Theme switching via `next-themes`

## Environment Variables

```
DATABASE_URL              # PostgreSQL connection string
BETTER_AUTH_SECRET        # Secret for Better Auth sessions
NEXT_PUBLIC_APP_URL       # Base URL (e.g. https://example.com)
SUBSCRIBER_TOKEN_SECRET   # JWT secret for subscriber confirm/unsubscribe tokens
RESEND_API_KEY            # Resend email API key
RESEND_FROM_EMAIL         # Sender address (optional, defaults to onboarding@resend.dev)
```
