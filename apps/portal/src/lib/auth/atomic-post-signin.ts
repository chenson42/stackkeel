// apps/portal/src/lib/auth/atomic-post-signin.ts (NEW)
//
// Post-sign-in destination resolver for the ATOMIC 2FA path only (flag
// ATOMIC_TOTP_FLAG, second-factor-policy.ts) —
// apps/portal/docs/work-log/2026-09-08-2fa-atomic-convergence.md Phase 3
// §§ 1-2. Sibling to, and deliberately NOT merged with, @repo/auth's
// resolvePortalPostSignInDestination (the LEGACY resolver
// two-factor-gate.ts re-exports, per that file's own precedent against
// collapsing separately-gated resolvers into one config-driven function —
// packages/auth/src/post-signin.ts's header states this explicitly and
// this file follows the same discipline).
//
// resolvePortalPostSignInDestination's whole job is deciding whether to
// detour through /totp, because under the LEGACY model a session can exist
// pre-2FA-clear. Under the ATOMIC model no such session is ever issued —
// authorize() already demanded and validated the code (or determined none
// was owed) before minting one — so /totp never needs to be reached from
// here. The only decision left is Chris's ruling row 2: an admin-ish user
// who has never enrolled TOTP gets a one-time nudge to /account/2fa
// (Entry Check #1 in Phase 3: this is genuinely NEW behavior for Portal,
// not "unchanged from today" as Chris's ruling table phrased it — Portal
// has no forced-enrollment gate today at all). Rows 1/3 already cleared
// their code inside authorize(); row 4 never owed one — all three pass
// straight through to callbackUrl.
export function resolvePortalAtomicPostSignInDestination(
  policy: { owesSecondFactor: boolean; hasTotp: boolean } | null | undefined,
  callbackUrl: string,
): string {
  if (!policy) return callbackUrl;
  // owesSecondFactor && !hasTotp is exactly "admin-ish, never enrolled"
  // (row 2) — see second-factor-policy.ts: owesSecondFactor is
  // `isAdminIsh || hasTotp`, so if hasTotp is false here, owesSecondFactor
  // being true necessarily means isAdminIsh was true.
  if (policy.owesSecondFactor && !policy.hasTotp) {
    const params = new URLSearchParams({ callbackUrl });
    return `/account/2fa?${params.toString()}`;
  }
  return callbackUrl;
}
