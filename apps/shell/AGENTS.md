# Shell — App Notes

Canonical instructions live in the ROOT [`AGENTS.md`](../../AGENTS.md); the
mobile domain brief is `.claude/agents/mobile-developer.md`. This shim carries
only this app's deltas.

- **What it is:** the Capacitor thin shell (iOS + Android) that loads the
  DEPLOYED portal via `SHELL_PORTAL_URL`. The thin-shell bet is binding: no
  product UI here, ever — native capabilities only.
- **Generated code:** `ios/` and `android/` are Capacitor-generated and
  committed; edit what the generators surface, regenerate rather than fight
  them (`rm -rf ios android && pnpm --filter shell cap:add`).
- **Web bridge:** the interesting logic lives in the PORTAL
  (`apps/portal/src/components/mobile/`, `src/lib/mobile/`) — splash
  dismissal, device registration, deep-link routing, version gating.
- **Identity:** `appId`/`appName`/scheme are personalize-rewritten
  placeholders (`com.example.stackkeel`).
- **Commands:** `pnpm --filter shell typecheck | cap:sync | cap:open:ios |
  cap:open:android`. `lint`/`test`/`build` are documented no-ops — native
  verification is on-device (README → Verification).
