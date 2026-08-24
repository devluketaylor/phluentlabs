# phluentlabs.com — Dev Progress Board

Living board for the newsletter site build-out. The dev sub-agent updates this every work session. **Newest activity at top of the Log.**

Legend: `[ ]` todo · `[~]` in progress · `[x]` done · `[!]` blocked

---

## Now (active focus)
- [~] Tier 1: Subscribers admin upgrades

## Workflow
- **Dev loop:** cron `phluentlabs-dev-loop` runs 3x/day (8am, 2pm, 8pm CDT). Each run does ONE board item, commits locally, updates this board, posts a summary to Discord.
- **Code review:** Tessie reviews each dev-loop commit before Luke pushes to main. (Future: dedicated code-review sub-agent once volume justifies it — reviews diffs, checks conventions/tsc, flags issues, then Tessie/Luke approve + push.)
- **Push/deploy:** always Luke's explicit green light. Dev loop NEVER pushes or deploys.

## Tiers (roadmap)

### Tier 1 — Fix + foundational polish
- [x] Fix subscribers edit Status dropdown (raw Radix SelectItem → ui wrapper) — pushed `9c390e8`
- [ ] Add-subscriber button + manual add form
- [ ] CSV import (upload) + export (download) for subscribers
- [ ] Pagination + total counts on subscribers table
- [ ] Pagination + total counts on newsletters table
- [ ] Bulk actions on subscribers (multi-select → status change / delete / export)
- [ ] Toast notifications for all admin mutations (no more silent saves)

### Tier 2 — Dashboard & insight
- [ ] Admin dashboard: total subscribers, growth this week, status breakdown, last send stats, scheduled queue
- [ ] Subscriber detail view: signup date, confirm/unsub history, issues received

### Tier 3 — UX/UI overhaul
- [ ] Replace raw 12-col grids with proper sortable data tables (sticky header, nicer empty/loading)
- [ ] Send analytics (opens/clicks/bounces) via Resend webhooks
- [ ] Rich editor improvements (templates, image handling, preview-as-email)

---

## Log (newest first)
<!-- Each entry: date/time, what changed, commit hash if applicable, any blockers -->

### 2026-08-24
- Fixed subscribers Status dropdown import bug; pushed to main (`9c390e8`).
- Stood up rootless local dev env: embedded Postgres :5433, dev `.env`, migrations applied, 4 seed subscribers + 1 seed newsletter, dev admin `admin@dev.local`. Verified `adminSubscribers.list` returns data (HTTP 200).
- Made `db/client.ts` SSL-conditional (works local + prod).

---

## Conventions (dev sub-agent MUST follow)
> Full standing brief + read-lean rules live in `DEV_AGENT.md`. Read that first each run.

- **Never auto-push to `main` or auto-deploy.** Commit locally; Tessie/Luke review + push. Exception: none.
- **Never publish/send a real newsletter** or touch production data.
- Work only in `projects/phluentlabs/`. Keep `.env`, `.devdb/`, `node_modules/` OUT of git (already ignored — verify).
- After each feature: `npx tsc --noEmit` must pass; test against local dev server before marking `[x]`.
- Commit each logical unit separately with a clear message. Update this board (Log + checkboxes) every session.
- If blocked (missing env, ambiguous product decision, external creds), mark `[!]`, note it here, and surface to Tessie — don't guess on product/UX calls that change scope.
- Preserve light + dark mode. Don't hard-code text colors on themed elements (coral accent `#ff5c5c` is safe on both).
- Match existing patterns (tRPC routers, drizzle schemas, shadcn/radix ui wrappers in `components/ui`). Reuse `@/components/ui/*` — never import raw `@radix-ui/*` for wrapped primitives.

## Local dev env (how to run/verify)
- Postgres: embedded, port 5433, db `phluent`, user/pass dev/dev. Start via `.devdb/pg.mjs` pattern (see `.devdb/`).
- `DATABASE_URL` in `.env` uses `?sslmode=disable`.
- Dev server: `npm run dev` (port 3000). Logs in `.devdb/next.log`, pg logs in `.devdb/pg.log`.
- Dev admin: `admin@dev.local` / `devpassword123` (role promoted to admin in DB).
- Seed data: 4 subscribers (one per status), 1 draft newsletter.
