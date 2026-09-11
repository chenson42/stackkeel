# Docs Site Content Overhaul — Work Log

**Date:** 2026-09-11
**Classification:** Polish (content/positioning rework; no schema, deps, or API
surface changes). Phases 2 & 3 skipped per the Polish pipeline with this notation.
**Source:** Two external reviews of stackkeel.org (SEO/discovery; positioning/
structure) relayed by the operator, plus the operator's LinkedIn essay as source
material for a new "Why Stackkeel" page.

## What changed

- **Homepage rebuilt** (`index.md` → `index.mdx`): keyword-bearing `<title>`
  ("Cross-AI Starter Kit for Next.js, Expo, and Capacitor" — fixes the
  "Stackkeel | Stackkeel" duplicate), new hero ("Build production apps with AI
  without starting from scratch"), three differentiators, four embedded real app
  screenshots with descriptive alt text, features regrouped by capability
  ("Production features included" replaces "Built-in maintenance"; file paths moved
  to "Under the hood"), five-step lifecycle framing, "Why not create-next-app?"
  comparison, MIT/free + honest v0.1 maturity statement, JSON-LD
  SoftwareSourceCode schema in frontmatter head.
- **New pages:** `why-stackkeel.md` (essay distillation, links the original),
  `cross-ai.md` (the lock-in problem, AGENTS.md, Agent Skills, enforcement table),
  and seven `features/*` pages (authentication, permissions, audit-and-flags,
  email-queue, helpdesk, theming, mobile) — each with searchable titles, plain
  meta descriptions, verified code paths, and screenshots where relevant.
- **Existing pages** retitled with search vocabulary + plain descriptions;
  mid-sentence em-dash density reduced in workflow/personalization/sync prose.
- **Sidebar** regrouped: Start Here / Features / Guides.
- **README.md restructured:** banner, one-line value prop, searchable opening,
  badges (CI, release, MIT, Node), three differentiators, grouped feature table,
  works-with row, quickstart, honest status block.
- `robots.txt` (added by the parent session) retained.

## Claims Ledger

| # | Claim | Class | Evidence |
|---|-------|-------|----------|
| 1 | Every feature-page capability claim matches shipped code | Verified | spot-checks run against `packages/auth/src/lockout.ts` (5/900s), `two-factor.ts` (10 codes), `packages/db/src/email-queue.ts` (maxAttempts 8), `tickets.ts` (reopen transitions), `apps/portal/vercel.json` (2 crons) before writing |
| 2 | Homepage `<title>` no longer duplicates the brand | Verified | built `dist/index.html` grep (Phase 5 below) |
| 3 | All 16 pages build and appear in the sitemap | Verified | build output + sitemap grep (Phase 5 below) |
| 4 | No fabricated adoption/benchmark claims added | Verified | status copy states v0.1/new only; test counts match the v0.1 release notes |

## What was NOT verified

- Search-result impact (rankings, indexing) — inherently post-deploy; Search
  Console/Bing submission is a user action.
- Rendered visual appearance of the new homepage in a browser (build-level
  verification only).
- The JSON-LD block against Google's Rich Results tester.

## Phase 6 — Shipped vs Intent

Both reviews' priority items are implemented except: analytics (explicitly
deferred, user decision), a live demo site (filed in TODO), and Search
Console/Bing submission (user-account actions). SHIP WITH NOTES.
