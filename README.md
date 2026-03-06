# PhluentLabs

A full-stack newsletter platform built for developers. Readers can subscribe, confirm their email, and browse past issues — admins can write, manage, and track newsletters from a protected dashboard.

---

## Features

**Public**
- Multi-step subscribe form with email confirmation via Resend
- Paginated archive of past newsletter issues
- Individual issue pages with full rich-text content
- Unsubscribe via signed token link

**Admin**
- Create newsletter issues with a rich text editor (Tiptap)
- Manage newsletters — edit content, change status (draft / scheduled / sent), delete
- Manage subscribers — search, filter by status, edit, delete
- Role-based access via Better Auth (admin role required)

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) |
| API | tRPC v11 |
| Database | PostgreSQL + Drizzle ORM |
| Auth | Better Auth |
| Email | Resend |
| UI | Tailwind CSS v4 + shadcn/ui |
| Forms | React Hook Form + Zod |
| Editor | Tiptap |

---

## Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Set up environment variables

Create a `.env.local` file at the root:

```env
DATABASE_URL=postgresql://...
BETTER_AUTH_SECRET=your-secret
NEXT_PUBLIC_APP_URL=http://localhost:3000
SUBSCRIBER_TOKEN_SECRET=your-token-secret
RESEND_API_KEY=re_...
RESEND_FROM_EMAIL=you@yourdomain.com
```

### 3. Run database migrations

```bash
npm run db:migrate
```

### 4. Start the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Database

```bash
npm run db:generate   # Generate migrations from schema changes
npm run db:migrate    # Apply migrations
npm run db:studio     # Open Drizzle Studio
```

---

## Project Structure

```
app/
  (app)/            # Public site — home, /issues/[id], /confirm, /unsubscribe
  (auth)/           # Login & signup
  (admin)/admin/    # Admin dashboard (requires admin role)
  api/
    trpc/           # tRPC handler
    auth/           # Better Auth handler

components/
  admin/            # NewslettersTable, SubscribersTable, NewsletterRichEditor
  forms/            # SubscribeForm (multi-step)
  ui/               # shadcn/ui components

trpc/
  routers/          # subscribe, newsletter (public + admin), adminSubscribers
  server.ts         # Context, publicProcedure, adminProcedure

db/
  schemas/          # subscribers, newsletters, newsletter-recipients, auth
  migrations/
```

---

## Admin Access

Admin users require the `admin` role set via Better Auth. The `/admin` route checks for this server-side and redirects unauthorized users.

---

## Subscriber Flow

1. User submits the subscribe form → `status: pending`, confirmation email sent
2. User clicks the confirmation link → `status: subscribed` (24h token)
3. Unsubscribe links use a separate JWT with a 30-day expiry
