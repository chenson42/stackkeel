# TODO

Single backlog ledger. Reconcile in the same commit that creates or resolves an item
(AGENTS.md Workflow Rule 9). Format: `- [ ] <item> — <source, date>`.

## In flight

- [ ] Phase 0 — Bootstrap: workspace, kit manifest + detection, standards docs, docs
      spine, agent roster, core skills, tripwires, CI skeleton — plan 2026-09-10

## Next up (build phases from the approved plan, 2026-09-10)

- [x] Phase 1 — Data + auth spine (2026-09-10, work-log: phase-0-bootstrap —
      delivered alongside Phase 0)
- [x] Phase 2 — Apps: portal + admin + `packages/ui` + `packages/tokens`
      (2026-09-10, work-log: 2026-09-10-phase-2-portal-admin-apps; see its
      Deviations section)
- [ ] Phase 3 — Platform features: email queue + cron + admin viewer + Resend webhook;
      feedback + prompt card + admin triage; what's-new; helpdesk (tickets/messages/
      actions, portal Support, admin triage queue, promote-feedback-to-ticket, email
      triggers); brand engine (`packages/brand` + `packages/tokens` + admin branding
      editor + `check:brand-scope`); maintenance cron + `/api/health`
- [ ] Phase 4 — Mobile: `apps/shell` (Capacitor 8 + GoogleSignInPlugin + push
      scaffolding), portal web bridge (use-is-native, device registrar, deep links,
      AASA, AppVersionGate + `app_release_policy` + admin editor), `apps/mobile` (Expo +
      expo-router, secure-store device token, pairing, typed API client, offline queue),
      server device auth + admin devices page
- [ ] Phase 5 — Meta-layer: personalize skill + `module-registry.json` +
      `strip-module.mjs` + `identity-files.json` + `check-identity-files.mjs`;
      personalize-gate hook; upstream/downstream-sync skills + `kit-sync-reminder.yml`;
      `kit:status` full digest + `kit:verify`; e2e workflow (Neon branch) + db-sync +
      claude-review workflows
- [ ] Phase 6 — Docs-site: Astro Starlight content + GitHub Pages deploy workflow;
      README expansion
- [ ] Phase 7 — Dogfood verification: full Playwright e2e; personalize dry-run in a
      scratch clone (strip mobile+helpdesk variant must build); kit-check matrix
      (canonical / fresh clone / declined); tag `v0.1.0`

## Phase 2 follow-ups (from the work-log's Deviations)

- [ ] Admin dashboard tile grid (ADMIN_TILES registry) — `/` currently redirects to `/users`
- [ ] Wire TopNav/BottomTabs (@repo/ui) as the portal's mobile-forward chrome
- [ ] Portal account "devices" page — deferred to Phase 4 device auth
- [ ] `check-cross-app-table-collision` tripwire once a fork schema exists
