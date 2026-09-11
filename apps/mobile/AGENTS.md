# Mobile — App Notes

Canonical instructions live in the ROOT [`AGENTS.md`](../../AGENTS.md); the
mobile domain brief is `.claude/agents/mobile-developer.md`. This shim carries
only this app's deltas.

- **What it is:** the Expo (expo-router) native app. A real native client for
  forks that outgrow the WebView shell — but still THIN (Key Invariant 14):
  the portal's REST API is the only business logic; this app renders.
- **Auth:** device bearer token only, never a web session. Pairing: the user
  mints a 6-digit code at the portal's `/account/devices` and enters it in
  `app/pairing.tsx` → `POST /api/devices` returns the token once →
  `expo-secure-store`. A `401 device_revoked` anywhere clears state and
  returns to pairing (revocation bus in `src/lib/revocation-bus.ts`).
- **API:** `src/lib/api-client.ts` — typed `{reason}` errors, Idempotency-Key
  support, dependency-injected for tests. Offline writes go through
  `src/lib/offline-queue.ts` (AsyncStorage, backoff, poison-after-8).
- **Styling:** `@repo/tokens` constants; no web CSS.
- **Config:** `EXPO_PUBLIC_API_URL` (deployed portal; Android emulator uses
  `http://10.0.2.2:3000`). Identity placeholders in `app.json`
  (name/slug/scheme/bundle ids) are personalize-rewritten.
- **Commands:** `pnpm --filter mobile start | typecheck | lint | test`.
  `build` is a typecheck proxy — real builds via `npx expo run:ios|android`
  or EAS. Unit tests are vitest over `src/lib` pure logic only (native
  modules aliased to inert stubs in vitest.config.ts).
