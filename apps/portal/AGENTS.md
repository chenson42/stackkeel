# Portal — App Notes

Canonical instructions live in the ROOT [`AGENTS.md`](../../AGENTS.md) — read
that first (pipeline, invariants, workflow rules, commit grammar). This shim
carries only this app's deltas.

- **What it is:** the member-facing app. Port **3000** (`pnpm --filter portal dev`).
- **Routes:** `(auth)` signin/totp · `(member)` home/whats-new/feedback ·
  `(account)` account + 2FA · `(password-reset)` · `/launch` (post-auth
  routing, pure function in `src/app/launch/destination.ts`) ·
  `/change-password` (forced-change gate).
- **Edge gate:** `src/proxy.ts` — PUBLIC_PATHS + declarative PROTECTION_RULES
  over the JWT session projection. It never imports a DB client. Every
  precedence change here must be mirrored in `@repo/auth`'s portal
  post-sign-in resolver (and vice versa).
- **Schema:** shared identity/platform tables come from `@repo/db`; this
  app's own first domain table goes in `src/lib/db/schema.ts` under a
  `portal` Postgres schema.
- **Commands:** `pnpm --filter portal typecheck | lint | test | build`.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
