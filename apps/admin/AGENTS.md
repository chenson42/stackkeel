# Admin — App Notes

Canonical instructions live in the ROOT [`AGENTS.md`](../../AGENTS.md) — read
that first (pipeline, invariants, workflow rules, commit grammar). This shim
carries only this app's deltas.

- **What it is:** the platform control plane. Port **3001**
  (`pnpm --filter admin dev`). Every route is admin-only: role gate AND TOTP
  enrollment are enforced at the edge (`src/proxy.ts`) and re-checked in the
  layout (defense in depth).
- **Pages:** `/users` (+ `[id]`: roles, 2FA reset, deactivate, invites) ·
  `/roles` (role × feature matrix; `ADMIN_PROTECTED_FEATURES` renders as
  permanently disabled cells) · `/flags` · `/audit` · `/feedback` ·
  `/email-queue` · `/whats-new` · `/docs` (release-notes viewer).
- **2FA model:** atomic — TOTP is verified inside `authorize()` at sign-in;
  enrollment lives at `/setup-mfa`. Do not converge this onto the portal's
  separate-route model without reading `src/lib/auth/post-signin.ts`.
- **Audit:** every mutation writes an `AUDIT_ACTIONS` event (including
  blocked attempts). CI's audit-coverage tripwire enforces this.
- **Commands:** `pnpm --filter admin typecheck | lint | test | build`.

<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — read the relevant guide in
`node_modules/next/dist/docs/` before writing any code.
<!-- END:nextjs-agent-rules -->
