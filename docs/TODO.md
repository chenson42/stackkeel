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
- [x] Phase 3 — Platform features (2026-09-11, work-log:
      2026-09-11-phase-3-helpdesk-brand-maintenance): helpdesk (tickets/messages/
      actions, portal Support, admin triage queue, promote-feedback-to-ticket,
      5 queued email triggers); brand engine (`packages/brand` contract/OKLCH
      generator/BrandTokens emitter + admin branding editor + `ui.brand_theming`
      flag + `check-brand-scope` tripwire + `pnpm brand:generate`); maintenance
      cron repaired (ancestor-table refs removed, invite-token GC added) +
      `/api/health` on both apps. Email queue/cron/webhook + feedback + what's-new
      had already landed with Phase 2's port.
- [ ] Helpdesk follow-ups (from Phase 3's SHIP WITH NOTES): message attachments
      (needs blob storage — schema comment marks the extension point in
      ticket_messages); type-pairing FONT WIRING (branding stores the pairing but
      the apps' next/font loading doesn't switch faces yet); open-tickets count in
      `kit:status`; admin roles UI surfacing `admin.tickets`/`admin.branding` is
      automatic via FEATURE_CATALOG (verified) — no action
- [x] Phase 4 — Mobile (2026-09-11, work-log 2026-09-11-phase-4-mobile):
      `apps/shell` (Capacitor 8, generated ios/ + android/ committed), portal
      web bridge (use-is-native, device registrar, deep links, AASA +
      assetlinks, AppVersionGate + `app_release_policy` + admin editor),
      `apps/mobile` (Expo + expo-router, secure-store token, pairing, typed
      API client, offline queue), server device auth + `/account/devices` +
      admin `/devices` + `/app-release`. Deferred pieces below.
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
- [x] Portal account "devices" page — shipped in Phase 4 (`/account/devices`)
- [ ] `check-cross-app-table-collision` tripwire once a fork schema exists

## Phase 4 follow-ups (from the work-log's Phase 6 NOTES)

- [ ] Push notifications: implement `primePushRegistration()` in the portal
      bridge with `@capacitor/push-notifications` (shell) / `expo-notifications`
      (mobile); server `push_token` column + PATCH path already exist
- [ ] Shell native Google Sign-In plugin (backend `google-native` provider is
      ready; needs a compiled-and-tested native plugin — see apps/shell/README)
- [ ] Device-token storage upgrade in the shell: Capacitor Preferences →
      Keychain/EncryptedSharedPreferences plugin for at-rest protection
- [ ] On-device verification pass (build shell on a real device, pair the Expo
      app against a running server, verify revocation push-out) — Phase 7
- [ ] Deep-link scheme registration in the generated native projects
      (Info.plist URL types / Android intent-filter) when a fork personalizes
