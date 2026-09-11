---
name: personalize
description: One-session rebrand of a fresh kit copy into a real project — identity interview, app/feature selection with registry-driven stripping, brand generation, strategic docs, manifest write. Run when kit-check reports UNPERSONALIZED. Never commits; the user reviews the diff.
argument-hint: "[project-name]"
---

# Personalize

Turn an unpersonalized copy of the kit into this fork's own project. Interview → select
→ strip → rebrand → document → record. **Nothing is committed** — the final diff is the
user's to review. Every step below is a plain checklist any Agent Skills-compatible
assistant (or a human) can execute.

Machine-readable inputs this skill drives from (never inline their contents here):

- `scripts/kit/module-registry.json` — what each optional module is and how to strip it
- `scripts/kit/identity-files.json` — every file the find-replace pass must touch
- `kit.json` — the manifest this skill writes at the end

## Step 0 — Preconditions

1. `git status --porcelain` must be empty. Dirty tree → stop; ask the user to commit or
   stash first (personalization must be one reviewable diff).
2. `pnpm kit:check --why`:
   - `CANONICAL-OK` → **refuse**: "This is the canonical kit repo; personalization is
     for copies." Stop.
   - `PERSONALIZED-OK` → confirm the user wants a re-run. Re-runs are merge-semantics:
     re-ask only what they want to change, never re-strip an already-stripped module,
     append (don't overwrite) `kit.json` records.
   - `UNPERSONALIZED` / `DECLINED` → proceed.
3. Confirm `origin` points at the user's own repository (not the canonical URL).

## Step 1 — Identity interview

Ask ONE at a time; echo the full set back for confirmation before editing anything:

1. Project name (display, e.g. "Acme Portal")
2. Slug (kebab-case; becomes root package name, app scheme, default bundle-id stem)
3. One-line description
4. Repository URL (the fork's own)
5. Contact / from-email (transactional sender)
6. License (keep MIT / proprietary / other)

## Step 2 — Project selection

`portal` is mandatory (the kit's spine). For each optional app, present its
`label` + `operatingCost` from the module registry and ask keep/strip
(multi-select where the assistant supports it): **admin**, **shell**, **mobile**,
**docs-site**. Read the registry's `warnings` for anything the user should hear
before deciding (e.g. stripping admin removes the only users/roles UI).

## Step 3 — Feature selection

Same, for feature modules: **helpdesk**, **feedback**, **twoFactor**, **oidc**,
**emailQueue**, **whatsNew**, **flagsAdmin**, **auditViewer**.

Not offered (core, non-removable): auth core, the permission model, flag
infrastructure, audit writes, the brand engine, the email queue itself, migrations
discipline. Note that `twoFactor`/`oidc` are `keep-dormant` strips (registry
`warnings` explain) and `flagsAdmin`/`auditViewer`/`emailQueue` strip admin pages
only.

## Step 4 — Strip

For each deselected module, in this order — apps first, then features, so shared-seam
fences are removed before feature passes re-read the same files:

```bash
pnpm kit:strip -- <module> --dry-run   # show the user the plan
pnpm kit:strip -- <module>             # execute (also records kit.json paths.removed)
pnpm turbo typecheck build             # verify after EACH module
```

If verification fails: `git checkout -- . && git clean -fd <the module's paths>` to
roll back, re-select the module as kept, report the failure verbatim, and continue
with the remaining modules. A `SEAM PENDING` note in the plan means the registry
expects 1–2 dangling imports — fix exactly what the typecheck names, nothing more.
Stripping both `shell` and `mobile` auto-strips `device-auth`; the dry-run shows it.

## Step 5 — Branding

1. Ask for the brand seed color (hex). Default offered: keep Starter Blue.
2. `pnpm brand:generate <hex>` — show the user both scheme ramps and the
   `adjustments[]` log (what the generator changed to clear contrast floors).
3. Apply: update the static `--brand-*` values in `packages/ui/src/theme.css` to the
   generated light/dark ramps (the runtime `branding` DB row stays empty until they
   choose to use the admin editor; the flag `ui.brand_theming` stays off).
4. Ask which of the four type pairings (`classic` / `modern` / `warm` /
   `contemporary` — see BRANDING.md) and record the choice in
   `docs/product/branding.md` (wiring fonts is a post-personalization task; the kit
   stores the choice).
5. Light/dark/auto preference → set the default theme in both apps' providers.

## Step 6 — Strategic docs

For each of `docs/product/vision.md`, `business-plan.md`, `branding.md` offer three
paths: **(a)** user pastes existing content; **(b)** interview — 4–6 questions each
(vision: who is it for, the one-sentence promise, what it replaces, success in 12
months; business plan: revenue model, first 10 customers, cost drivers, riskiest
assumption; branding: voice adjectives, audience register, words to avoid); **(c)**
skip — write the template with `TODO(owner):` markers.

## Step 7 — Identity find-replace

Walk `scripts/kit/identity-files.json` (READ the registry — never a hardcoded list).
For each file, apply the `note`-described edits: kit name/slug → the new identity,
`com.example.<kit>` bundle ids → the user's reverse-domain id, deep-link scheme, docs
URLs, the docs.yml repository guard (or delete docs.yml if docs-site was stripped),
LICENSE holder. The Android package **directory** rename is included (registry note
on `MainActivity.java`). Generated Capacitor configs: edit `capacitor.config.ts` then
tell the user to run `npx cap sync` in `apps/shell` rather than hand-editing the
generated copies. Then sweep:

```bash
grep -ri "<kit-name>" --exclude-dir=node_modules --exclude-dir=.git . | grep -v docs/
```

Anything left outside `docs/` (history is fine to keep) gets fixed now.

## Step 8 — Wire strategic docs into the instructions

Append a `## Project Context` section to `AGENTS.md` (project name, one-liner,
pointers to `docs/product/*.md`) and add `docs/product/vision.md` to the analyst
agent's Phase-1 reading list in `.claude/agents/analyst.md`.

## Step 9 — Manual-TODO report

Print a checklist of what only a human can do. Base set: provision Postgres (Neon) +
set `DATABASE_URL`; `openssl rand -base64 32` → `AUTH_SECRET`; same →
`AUTH_TOTP_ENCRYPTION_KEY` (warn: cannot rotate later, if twoFactor kept); Google
OAuth client + redirect URIs per kept app; `INITIAL_ADMIN_EMAILS`; Resend key +
verified sender; `NEXT_PUBLIC_APP_URL`/`AUTH_URL` per deploy target; Upstash (or
accept in-memory rate limiting); Turnstile keys (or leave no-op); icon/wordmark asset
replacement beyond the generated ones; create the GitHub repo + push; hosting setup
(e.g. Vercel projects per kept app). Conditionals: **shell kept** → set the deployed
portal URL for `npx cap sync`, Apple/Google dev accounts, real bundle ids in stores;
**mobile kept** → EAS account, `EXPO_PUBLIC_API_URL`; **docs-site kept** → enable
GitHub Pages on the new repo (the workflow guard was retargeted in Step 7); **oidc
kept** → issuer/client env vars; **emailQueue kept** → `CRON_SECRET` + cron
enablement on the host.

## Step 10 — Write the manifest

Update `kit.json`:

- `identity`: `role: "fork"`, `personalized: true`, `personalizedAt: <today>`,
  `projectName`, `slug`, `personalizationDeclined: false`
- `modules`: the Step 2/3 selections (kept = true)
- `paths.personalized`: every file actually edited in Steps 5–8 (seed from the
  identity registry + theme.css + docs/product/)
- `paths.removed`: already appended by each strip (verify entries exist)
- `sync.upstream.lastSyncedDate`: today (primes the 14-day cadence clock);
  `baselineSha`/`lastSyncedSha`: today's canonical main SHA if `gh` can fetch it
  (`gh api repos/<canonical>/commits/main --jq .sha`), else leave empty for
  `/upstream-sync` first-run bootstrap
- Leave `kit.name`/`kit.canonicalUrl` UNCHANGED — they identify the upstream kit,
  not this fork.

Run `pnpm kit:check --why` (expect PERSONALIZED-OK) and `pnpm check`.

## Step 11 — Do not commit

Print a summary (identity, kept/stripped modules, files touched, TODO count) and
stop. The user reviews `git diff` and commits when satisfied.
