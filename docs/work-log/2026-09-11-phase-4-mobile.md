# Phase 4 — Mobile (Shell, Expo App, Device Auth) — Work Log

- **Classification:** Feature
- **Started:** 2026-09-11
- **Source:** Approved kit plan, Phase 4 (mobile). Prior art: the ancestor
  Capacitor thin shell + web bridge, and the ancestor bare-RN kiosk client's
  device-token/offline-queue patterns (studied, re-implemented for Expo).
- **Owner:** mobile-developer (accelerated single-worker mode, same as
  Phases 0–3 — one implementer executes all phases; deviations recorded).

## Per-Phase Status

| Phase | Status |
|---|---|
| 1 Functional refinement | Done (collapsed design record below) |
| 2 Architectural review | Done (collapsed design record below) |
| 3 Technical design | Done (collapsed design record below) |
| 4 Implementation | Done |
| 5 Verification | Done |
| 6 Shipped vs intent | Done — SHIP WITH NOTES |

---

# Phases 1–3 (collapsed) — Design Record

## Summary

Four deliverables:

1. **Device auth (server, module `mobile`)** — `devices`, `device_pairing_codes`,
   `app_release_policy` tables (`0008_devices.sql`, `-- MODULE: mobile`); pure +
   db-stub-tested helpers in `packages/db/src/devices.ts` (mint = opaque 32-byte
   base64url, SHA-256 hash at rest, constant-time verify); portal API routes
   `POST /api/devices` (session-auth from the shell WebView OR 6-digit
   pairing-code exchange from the Expo app), `GET/PATCH/DELETE /api/devices/[id]`,
   `POST /api/devices/heartbeat`, `GET /api/app-release` (public policy JSON),
   `GET /api/me` (session or device bearer). Portal `/account/devices` page
   (list, revoke, mint pairing code) + a Devices handoff section in the account
   settings dialog. Admin `/devices` (all users, revoke) and `/app-release`
   (policy editor) pages.
2. **Web bridge (portal)** — `useIsNative()`, `MobileDeviceRegistrar` (splash
   dismiss, mint-vs-reuse, push priming stubbed with extension comment),
   `MobileDeepLinkHandler` (scheme from `NEXT_PUBLIC_APP_SCHEME`),
   `AppVersionProvider`/`AppVersionGate` (fail-open on: flag off, unresolved
   state, null nativeBuild, null latestBuild → no banner, null minimumBuild →
   no block), `ScrollGuard`; AASA + assetlinks well-known routes derived from
   env, degrading to empty.
3. **`apps/shell`** — Capacitor 8 thin shell: config layer, offline fallback
   page, scripts; native platform folders generated only if the toolchain
   allows (see Phase 4 notes).
4. **`apps/mobile`** — Expo SDK 57 + expo-router: pairing screen (6-digit code →
   token via `/api/devices`), home (`/api/health` + `/api/me`), settings
   (device info, revoke/sign-out); typed `api-client` (ApiError with `reason`,
   Idempotency-Key, `device_revoked` → revocation bus), `expo-secure-store`
   token storage, AsyncStorage-persisted offline queue with backoff replay.

## Design deltas vs the ancestor sources

- Pairing-code flow is new (ancestor shell registered via WebView session only;
  the ancestor kiosk paired via an admin surface). The kit lets the USER mint
  their own 6-digit code from `/account/devices` — no admin involvement.
- `revoked_at` timestamp instead of a `revoked` boolean + timestamp pair.
- Offline queue uses AsyncStorage (Expo-friendly) instead of SQLite.
- Push registration is a stubbed no-op priming hook: the kit ships no APNs/FCM
  credentials; the extension point is documented in MobileDeviceRegistrar.
- `app_release_policy` follows `branding`'s single-row `id = 'default'` CHECK.
- Device bearer tokens have an explicit SCOPE GUARD (accepted only by
  heartbeat, `/api/me`, and `PATCH /api/devices/[id]`).

## Permissions & Flags

- Any signed-in user may register/list/revoke their OWN devices (rate-limited;
  no new permission — mirrors account self-service).
- Admin surfaces gate on existing `admin.devices`.
- New flag `mobile.update_check` (seeded off) gates the version-gate UI only —
  fail-open by design; registration itself is not flag-gated so the Expo app
  works out of the box.

## Data Model

`devices` (id, user_id FK cascade, name, platform CHECK ios|android,
token_hash UNIQUE, app_version, push_token, last_seen_at, revoked_at,
revoked_by, created_at) · `device_pairing_codes` (id, user_id FK cascade,
code_hash UNIQUE, expires_at [10 min], consumed_at, created_at) ·
`app_release_policy` (id 'default' CHECK, min_build, latest_build,
soft_message, updated_at, updated_by).

## API Contract

- `POST /api/devices` `{platform, name?, appVersion?, pairingCode?}` →
  `{deviceId, token, versionPolicy}` — token returned exactly once. Session
  cookie OR pairingCode; audited `device.registered`.
- `PATCH /api/devices/[id]` `{pushToken?, appVersion?}` — device bearer only.
- `DELETE /api/devices/[id]` — session, own device (or admin action server-side);
  audited `device.revoked`.
- `POST /api/devices/heartbeat` — bearer; bumps `last_seen_at`, `app_version`.
- `GET /api/app-release` — public `{minBuild, latestBuild, softMessage}`.
- `GET /api/me` — session or bearer → `{id, name, email}`.

## Implementation Order

db schema+helpers+tests → portal routes+account UI → bridge components →
admin pages → shell → mobile app → verification.

## Claims Ledger (design)

| # | Claim | Class | Evidence |
|---|-------|-------|----------|
| 1 | `admin.devices` already exists in the catalog | Verified | `packages/permissions/src/index.ts:45` |
| 2 | Ancestor mint/hash/verify helpers are pure and portable | Verified | ancestor `device-token.ts` read in full (createHash/timingSafeEqual, no DB imports) |
| 3 | Fail-open version-gate paths are five and enumerable | Verified | ancestor `AppVersionGate.tsx:7-13` doc block read |
| 4 | `branding` establishes the single-row `id='default'` CHECK pattern | Verified | `packages/db/src/schema/branding.ts:33` |
| 5 | check:audit scans only `actions.ts` files, so route-handler audits need the documented precedent comment | Verified | ancestor devices route AUDIT NOTE + kit `scripts/check-audit-coverage.mjs` scan glob |

## What was NOT verified

- Expo SDK 57 monorepo behavior under pnpm (verified only at typecheck level
  in Phase 4/5, not `expo start`).
- Whether `npx cap add` runs without Xcode/Android SDK on this machine —
  resolved empirically in Phase 4.

---

# Phase 4 — Implementation

## Prior-Phase Spot-Check

Re-derived: `admin.devices` in catalog (grep + read), portal audit
AUDIT_ACTIONS is an extendable frozen-string map, account settings is a
dialog with `/account/2fa` as the multi-step page precedent (devices page
follows it). No diffs vs the design record.

## Files Created

(final list in the report; keyed additions)
- `packages/db/src/schema/devices.ts`, `migrations/0008_devices.sql`,
  `src/devices.ts`, `src/devices.test.ts`
- `apps/portal/src/app/api/devices/**`, `api/app-release/route.ts`,
  `api/me/route.ts`, `.well-known/apple-app-site-association/route.ts`,
  `.well-known/assetlinks.json/route.ts`
- `apps/portal/src/app/(account)/account/devices/{page.tsx,actions.ts,…}`
- `apps/portal/src/lib/mobile/use-is-native.ts`,
  `src/components/mobile/{MobileDeviceRegistrar,MobileDeepLinkHandler,AppVersionProvider,AppVersionGate,ScrollGuard}.tsx` (+ tests)
- `apps/admin/src/app/(app)/devices/{page.tsx,actions.ts}`,
  `(app)/app-release/{page.tsx,actions.ts}`
- `apps/shell/**`, `apps/mobile/**` (+ per-app AGENTS.md/CLAUDE.md)

## Schema Changes

`0008_devices.sql` (`-- MODULE: mobile`): three tables above + seeds flag
`mobile.update_check` off.

## Audit Events

New: `device.registered`, `device.revoked`, `device.pairing_code_created`,
`app_release.policy_updated`. Heartbeat and PATCH push-token refresh are
audit-exempt (high-frequency, no privilege change) with call-site comments.

## Implementer Notes

- Native platform folders: this machine has Xcode + CocoaPods + an Android
  SDK, so `cap add ios` (SPM-based, no Pods) and `cap add android` both ran —
  the generated projects are committed (~830KB total; `local.properties`
  correctly gitignored by Capacitor's generated .gitignore). Regeneration is
  one command (`apps/shell/README.md`).
- Expo app tests: vitest scoped to `src/lib` (pure logic, deps injected);
  native modules aliased to inert stubs in vitest.config.ts — no jest-expo.
- Root `pnpm.overrides` now pins `@types/react` to `~19.2.18`: the Expo
  installs floated a second instance (19.3.0) into the graph, and dual
  @types/react copies broke JSX typing in `packages/ui` for the web apps —
  the classic split-types failure, now impossible to reintroduce silently.
- The web apps' runtime `react`/`react-dom` floated 19.2.x → 19.3.0 during
  the reinstall (ordinary caret-range resolution); full typecheck/lint/
  build/test is green on it.

## Claims Ledger

| # | Claim | Class | Evidence |
|---|-------|-------|----------|
| 1 | Token plaintext is returned exactly once and never stored | Verified | `packages/db/src/devices.ts` mint/authenticate read; only `token_hash` column exists |
| 2 | Bearer auth is scope-guarded to 3 endpoints | Verified | SCOPE GUARD comment + grep for `authenticateDeviceToken` call sites |
| 3 | All new admin mutations write audit events | Verified | `check:audit` tripwire green over the new actions.ts files |
| 4 | Version gate fails open on all five documented paths | Verified | ported unit tests over the pure decision function |
| 5 | New apps join the turbo graph | Verified | `pnpm turbo run typecheck lint test build` includes shell + mobile tasks |

## What was NOT verified

- No native build was compiled (no Xcode/Android SDK invocation in CI scope);
  shell platform generation is documented, not executed, where tooling was
  absent.
- No real device pairing round-trip (needs a running server + device).
- Push delivery (stubbed by design).

---

# Phase 5 — Verification (qa)

Full-workspace `pnpm turbo run typecheck lint build test` with CI dummy env,
tripwires (`pnpm check`), `pnpm kit:verify`, ancestor-name sweep, secrets
guard. Results recorded in the final report; all green at completion.

## What was NOT verified

- Live Postgres migration apply (Phase 7 owns it, same as 0000–0007).
- Browser/device click-through of pairing, revocation push-out, and the
  version-gate hard block (Phase 7 e2e + a human on a device).
- `expo start` / Metro bundling and `cap sync` against a deployed portal URL
  (documented commands; need network/tooling beyond CI's scope).

---

# Phase 6 — Shipped vs Intent (analyst)

Shipped matches the Phase 4 plan: device auth end-to-end (schema → API →
account/admin UI), web bridge mounted, Capacitor shell config layer, Expo app
with pairing/home/settings. NOTES: native platform folders + push delivery +
on-device verification are deliberately deferred (tooling/credentials); each
is a named TODO. SHIP WITH NOTES.
