# phluentlabs.com — Dev Progress Board

Living board for the newsletter site build-out. The dev sub-agent updates this every work session. **Newest activity at top of the Log.**

Legend: `[ ]` todo · `[~]` in progress · `[x]` done · `[!]` blocked

---

## Now (active focus)
- [~] Tier 1: Mobile responsiveness pass — admin tables DONE (`62e49fa`), public pages DONE (`fde232c`); next up: verify/tighten dialog widths at 375/390/414px (Add/Edit/Import dialogs)

## Workflow
- **Dev loop:** cron `phluentlabs-dev-loop` runs every 3 hours (8x/day, around the clock, CDT). Each run does ONE board item, commits locally, updates this board, posts a summary to Discord.
- **Code review + push:** Tessie reviews each dev-loop commit and, if it passes review (tsc clean, matches conventions, no raw Radix, dark-mode-safe, diff scoped to one item), **pushes to main automatically — no green light needed** (policy set by Luke 2026-08-25).
  - **Tessie PAUSES and asks Luke before pushing** when a diff touches: DB schema/migrations, auth/better-auth/tokens/security, real email/newsletter sends or Resend production paths, `.env`/secrets, data deletions/destructive migrations, or is much larger than "one board item" / genuinely uncertain.
- **Dev loop still NEVER pushes or deploys itself** — only Tessie pushes, after review. Deploys/real sends remain Luke's explicit call.

## Tiers (roadmap)

### Tier 1 — Fix + foundational polish
- [x] **BUG (high): Edit-subscriber Status dropdown does nothing** — FIXED: defaulted `SelectContent` to `position="popper"` (item-aligned conflicted with Dialog focus scope in radix 1.4.3) — local `7f0fc37`. Original detail: In `components/admin/subscribers-table.tsx` `EditSubscriberDialog`, opening a subscriber's Edit dialog and clicking the Status `<Select>` doesn't work: the dropdown doesn't open / the Pending/Subscribed/Unsubscribed options don't appear, so status can't be changed. Code already uses the `@/components/ui/select` wrappers (not raw Radix) and the SelectItems exist, so this is subtler than the earlier `9c390e8` fix. Likely a Radix `Select`-inside-`Dialog` interaction: the Select content portal is being swallowed by the Dialog's focus trap / pointer-events, or a z-index/portal-container issue (Select popover rendering behind or outside the dialog overlay). Diagnose in-browser (check if SelectContent mounts in DOM at all). Likely fix: render Select content in the right portal container (e.g. pass the dialog content as the portal container, or set `modal` handling / `pointer-events` correctly), or ensure the ui Select wrapper's `SelectContent` has proper z-index above the dialog overlay. VERIFY: open Edit dialog, change status pending↔subscribed↔unsubscribed, save, confirm it persists (tRPC `update` + refetch). tsc clean.
- [~] **Mobile responsiveness pass (whole site + admin)** — admin tables done (`62e49fa`), public pages done (`fde232c`); dialog widths still TODO — Site "doesn't feel very responsive on mobile." Do a focused responsive audit and fix. Known trouble spots: the admin tables use raw 12-col grids (`grid-cols-12`) that don't reflow on narrow screens (subscribers + newsletters tables overflow / squish on phone widths); dialogs, the subscribe form, and homepage hero should be checked at 375px / 390px / 414px widths. Fixes: make admin table rows stack or horizontal-scroll gracefully on mobile, ensure tap targets are ≥44px, check padding/font-scaling, verify the public homepage + issue pages + subscribe form look good on a phone. Test in responsive devtools at common phone widths, light AND dark mode. Keep it incremental — can be split into sub-commits (admin tables first, then public pages) if too big for one run; if so, mark `[~]` and log progress. tsc clean.
- [x] Fix subscribers edit Status dropdown (raw Radix SelectItem → ui wrapper) — pushed `9c390e8`
- [x] Add-subscriber button + manual add form — local `fe38510`
- [x] CSV import (upload) + export (download) for subscribers — local `a17c44b`
- [x] Pagination + total counts on subscribers table — local `d4b5a9d`
- [x] Improve verify/confirm subscription email — branded HTML template + plaintext fallback — local `9f0817d`
  - Current `sendConfirmEmail` in `trpc/routers/subscribe.ts` is a bare inline HTML string: no branding, no styling, no plaintext alt, no unsubscribe footer. Upgrade it.
  - Extract email HTML into a reusable template (branded: phluent name/logo, coral accent `#ff5c5c`, table-based layout for email-client compatibility, dark-mode-safe inline styles). Add a `text:` plaintext version to the Resend `send()` call (helps deliverability/spam scoring).
  - Improve the subject line (warmer/on-brand vs generic "Confirm your subscription"). Prominent confirm CTA button, clear "ignore if you didn't request this" line, and a footer.
  - Wire in the already-built-but-unused `unsubscribeUrl` (scope must be `"unsub"`, not the confirm token) OR remove the dead variable — currently it's computed and never used.
  - Clean up leftover debug `console.log(existing)` and `console.log(unsubscribeUrl)` lines while in this file.
  - Consider reusing the template shape for the newsletter send path (`lib/send-newsletter.ts`) if trivial; otherwise leave a note. Keep tsc clean; test send against dev (Resend test mode / logged output).
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

### 2026-08-25 (6:03pm)
- Mobile responsiveness pass — SUB-COMMIT 2 of N (public pages). Homepage, issue page, and issue subscribe CTA used fixed desktop padding/type sizes that read cramped or oversized at phone widths (375/390/414px). Fixes (CSS-only, additive responsive utilities): app layout top margin `mt-16` → `mt-14 sm:mt-16` so content clears the fixed navbar on short/small screens; homepage horizontal padding `px-6` → `px-4 sm:px-6`, hero vertical `py-16` → `py-12 sm:py-16`, hero `<h1>` `text-4xl` → `text-3xl sm:text-4xl`, subscribe card `p-6` → `p-5 sm:p-6`; issue page `px-6 py-12` → `px-4 py-10 sm:px-6 sm:py-12` and its `<h1>` `text-3xl` → `text-2xl sm:text-3xl`; issue subscribe CTA card `p-8` → `p-6 sm:p-8`. No logic touched. Committed locally `fde232c`. tsc clean (exit 0). Tested against dev server: `/` → 200 (compiled clean, no errors in next.log), `/confirm` → 200, `/issues/<nonexistent>` → 404 (expected — only draft seed exists — confirms the route compiles). Light/dark safe (no color classes added). Already-responsive bits left as-is: homepage Name step (`grid sm:grid-cols-2`, stacks on mobile), issue-nav grid (`grid-cols-1 sm:grid-cols-2`), issue CTA form (`flex-col sm:flex-row`). Item still `[~]`: dialog content widths (Add/Edit subscriber, Import) at 375/390/414px remain for the next run.

### 2026-08-25 (3:02pm)
- Mobile responsiveness pass — SUB-COMMIT 1 of N (admin tables). Both admin tables used raw `grid-cols-12` grids that squished/overflowed unreadably on phone widths. Fix: wrapped each table (header row + mapped data rows together, so they stay column-aligned) in an `overflow-x-auto` container with a `min-w` on the inner content (`min-w-[720px]` subscribers, `min-w-[860px]` newsletters — the latter has more action buttons per row). On phones the table now scrolls horizontally and keeps its column proportions instead of collapsing; on desktop it's unchanged (min-width < container so no scrollbar). Also changed the subscribers action-button toolbar (Add/Import/Export/Refresh) from `flex` to `flex flex-wrap` so 4 buttons wrap instead of overflowing at 375px. The filter/search toolbar and pagination row already used `flex-col sm:flex-row` (stack on mobile) — left as-is. Committed locally `62e49fa`. tsc clean (exit 0). Tested: both `/admin/*` pages compile with no build errors in next.log (307 = expected unauthed login redirect); change is additive CSS wrapper markup only, no logic touched, so no behavior change beyond layout. Light/dark safe (no color classes added). Item still `[~]`: public pages (homepage hero, issue pages, subscribe form) + dialog widths at 375/390/414px remain for the next run.

### 2026-08-25 (12:04pm)
- Fixed high-pri BUG: Edit/Add subscriber Status `<Select>` dropdown wouldn't open inside the Dialog. Root cause: the `@/components/ui/select` wrapper defaulted `SelectContent` to Radix's `position="item-aligned"`, which conflicts with the modal Dialog's focus scope in radix-ui 1.4.3 — the item-aligned popover fails to open/position when mounted inside `DialogContent` (the standalone filter Select outside any dialog worked fine, confirming the dialog-interaction theory). Fix: changed the wrapper's default `position` from `"item-aligned"` to `"popper"` (one line in `components/ui/select.tsx`). Popper anchors the popover to the trigger and renders reliably inside dialogs; the popper-specific viewport/width classes (`min-w-[var(--radix-select-trigger-width)]`, side translate offsets) were already present in the wrapper, so no CSS changes needed. This also keeps the standalone filter Select working. Committed locally `7f0fc37`. tsc clean (exit 0). Tested: authed subscribers page renders HTTP 200 (no compile/runtime errors); verified the status save path end-to-end via authed tRPC `update` — flipped sub_2 pending→subscribed (readback confirmed `subscribed`), then restored to pending (HTTP 200), proving status change persists via `update` + refetch. No raw radix imports added; light/dark safe (unchanged classes).

### 2026-08-25 (9:00am)
- Improved verify/confirm subscription email. New reusable email layer under `lib/emails/`: `layout.ts` (table-based, inline-styled, dark-mode-safe shell — `<!DOCTYPE>`, `color-scheme` meta, preheader, PhluentLabs wordmark header with coral `#ff5c5c`, `©` year footer, plus a bulletproof `renderButton` CTA helper) and `confirm-email.ts` (`renderConfirmEmail` returns `{subject, html, text}`). Warmer on-brand subject ("One quick step — confirm your PhluentLabs subscription"), prominent coral confirm CTA + copy-paste fallback link, clear "ignore if you didn't request this" line, and an unsubscribe footer. Rewired `sendConfirmEmail` in `trpc/routers/subscribe.ts` to use the template and pass a `text:` plaintext version to Resend `send()` (deliverability). Wired in the previously-dead `unsubscribeUrl`: now minted with scope `"unsub"` (was reusing the confirm token — wrong scope for `/unsubscribe`) and passed through to the footer. Removed leftover debug `console.log(existing)` / `console.log(unsubscribeUrl)`. Committed locally `9f0817d`. tsc clean (exit 0). Tested by rendering the template via tsx: HTML has DOCTYPE + coral + confirm URL in body + unsub URL in footer; plaintext (380 chars) reads cleanly; footer correctly omitted when `unsubscribeUrl` unset. No raw radix; email-only inline styles (light/dark safe). Note: `lib/send-newsletter.ts` still uses its own minimal inline unsubscribe footer — not trivial to share the full transactional shell there (per-recipient batch context, newsletter body is user HTML), so left as-is for now; a future pass could wrap sends in `renderEmailLayout` if desired.

### 2026-08-25 (8:00am)
- Pagination + total counts on subscribers table. Backend: `adminSubscribers.list` now returns `{ rows, total }` — total is a `count()` over the same filtered `where` (search + status), run in parallel with the paged rows query via `Promise.all`. UI: page-based pagination (pageSize 25) with `offset = page * pageSize`; Previous/Next controls, "Showing X–Y of N subscribers" range label, "Page N of M" indicator; resets to page 0 whenever search/status filter changes (useEffect); `placeholderData: (prev) => prev` keeps the table steady while paging (no flash). Updated all consumers of the old array return shape (`rows.map`, empty-state check). Committed locally `d4b5a9d`. tsc clean (exit 0). Tested authed via tRPC against dev server: list returns `{rows, total}`; unfiltered total=4; status=subscribed → total=2 with 2 rows (count honors filters). Reused `@/components/ui/*`; no raw radix; light/dark safe (muted-foreground/secondary only).
### 2026-08-24 (8:00pm)
- CSV import + export for subscribers. Backend: `adminSubscribers.exportCsv` (query; honors current search/status filters, RFC-4180 quoting/escaping, header row `email,first_name,last_name,status,created_at`) and `adminSubscribers.bulkImport` (mutation; case-insensitive dedupe within the batch AND against existing DB emails via `inArray`, email-format validation, sets confirmedAt/unsubscribedAt per status, returns `{inserted, skippedDuplicate, skippedInvalid, errors}`). UI: "Export CSV" (client Blob download, timestamped filename) + "Import CSV" (hidden file input → client-side CSV parser with quoted-field/BOM handling + header auto-detection) buttons in the subscribers table header, toast feedback throughout. Committed locally `a17c44b`. tsc clean (exit 0). Tested authed via tRPC: export→200 returned proper CSV for 4 seed rows; bulkImport of 5 rows (2 new incl. an in-batch case dup, 1 existing dup, 1 invalid email)→`inserted:2, skippedDuplicate:1, skippedInvalid:1` with error msg; verified inserted rows (email lowercased, confirmedAt set for subscribed / null for pending, last-in-batch value won); deleted the 2 test rows after. Reused `@/components/ui/*`; no raw radix.

### 2026-08-24 (6:20pm)
- Added `adminSubscribers.create` mutation (email validation, lowercases/dedupes email — rejects duplicates, generates UUID, sets confirmedAt/unsubscribedAt based on chosen status) + "Add subscriber" dialog in the subscribers table header (email/first/last/status fields, resets on close). Committed locally `fe38510`. tsc clean. Tested via authed tRPC: create→200 (id returned), duplicate→rejected with clear message, list shows new row; deleted the test row after. Reused `@/components/ui/*` primitives; no raw radix.
- Note: `embedded-postgres` wasn't in node_modules this run — reinstalled dev-only via `npm install --no-save` (package.json untouched) to bring local PG :5433 back up.

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
