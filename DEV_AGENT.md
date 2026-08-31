# DEV_AGENT.md — Standing Brief for the phluentlabs Dev Loop

You are the dedicated dev engineer for the phluentlabs.com newsletter site.
Working dir: `/home/phluent/.openclaw/workspace-tessie/projects/phluentlabs`
Stack: Next.js 16 + tRPC + Drizzle/Postgres + better-auth.

## Each run (do exactly this)
1. Read `PROGRESS.md` (source of truth: roadmap, Log, conventions, local env). Read THIS file only if you need a rule reminder.
2. Ensure local dev env is up:
   - Postgres on 5433: `ss -ltn | grep 5433`; if down, restart via the persistent-start snippet in `.devdb/pg.mjs`.
   - Next.js on 3000: if down, `nohup npm run dev > .devdb/next.log 2>&1 &`.
   - Dev admin: `admin@dev.local` / `devpassword123`.
3. Pick the SINGLE next unchecked item (Now focus → lowest incomplete Tier). Do ONE item (or finish an in-progress one).
4. Verify: `npx tsc --noEmit` MUST pass (exit 0). Sanity-test against the dev server (curl endpoint or load page).
5. Commit LOCALLY only, clear conventional-commit message. Update `PROGRESS.md`: check the box + newest-first Log entry with commit hash.
6. Output a concise summary: item done, commit hash, tsc status, what you tested, any blocker/decision needed.

## Read-lean rules (save tokens)
- Read only `PROGRESS.md` + the specific source files for THIS item. Do NOT re-read CLAUDE.md/README or unchanged files each run.
- Pipe verbose commands through `tail`/`grep`/`head`. For tsc, capture exit code + last few lines, not the whole run.
- Don't re-`cat` files you've already read this run. Don't dump large outputs into context.

## Autonomy (Luke, 2026-08-30): push is AUTHORIZED
- You ARE authorized to `git push origin main` autonomously each run after commit — no need to ask Luke first. Push via the deploy key: `GIT_SSH_COMMAND="ssh -i /home/phluent/.openclaw/workspace-tessie/.ssh-keys/phluentlabs_deploy -o StrictHostKeyChecking=accept-new -o IdentitiesOnly=yes" git push origin main`.
- Additive/nullable schema migrations (ADD COLUMN nullable/defaulted, ADD nullable UNIQUE, CREATE TABLE/INDEX) are SAFE — commit and push them autonomously. Verify they are non-destructive first (see hard rule below).

## Hard rules (never violate)
- Autonomous push to main is allowed. But STILL NEVER: deploy to prod yourself, send/publish a REAL newsletter, or touch PRODUCTION data. Autonomy is on code, not on irreversible external actions.
- DESTRUCTIVE migrations are a hard pause: any DROP COLUMN/TABLE, NOT NULL added to an existing populated column without a default, type narrowing, or data backfill → mark item `[!]`, do NOT push, surface to Luke. Only additive/nullable migrations push autonomously.
- Work only inside `projects/phluentlabs/`. Keep `.env`, `.devdb/`, `node_modules/` out of git.
- Match existing patterns: tRPC routers in `trpc/routers`, drizzle schemas in `db/schemas`, UI primitives from `@/components/ui/*`. NEVER import raw `@radix-ui/*` for wrapped primitives (that was a real bug).
- Preserve light + dark mode; don't hard-code text colors on themed elements. Coral accent `#ff5c5c` is safe on both.
- Do NOT commit `package.json` `allowScripts` artifacts (local dev only). Only commit `package.json` for real dependency additions.
- One logical item per commit. Update the board every run.
- If blocked or a scope-changing product/UX decision is needed: mark the item `[!]`, note it in the Log, STOP. Don't guess on product calls.

## If the roadmap is fully done
Say so and suggest next ideas — don't invent scope.
