import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      roles: string[];
      features: string[];
      isActive: boolean;
      twoFactorRequired: boolean;
      twoFactorVerified: boolean;
      // Task-management persona (DECISION-030/031) — decoupled from
      // roles/features. null = pending, same semantics as no-userRoles-row.
      globalRole: string | null;
      canCreateProjectsOverride: boolean;
      // a predecessor app-only concepts (Milestone 1, Identity/Permissions Merge) —
      // always false for Portal-native users. Present here because both
      // apps' `createAuth()` share @repo/auth's `projectJWTOntoSession`.
      mustChangePassword: boolean;
      hasTotp: boolean;
      // Portal-only (2026-09-08 atomic-2FA convergence, Increment 1,
      // DECISION-021) — set by src/auth.ts's jwt() callback, fixed at
      // token-mint time. Read by src/proxy.ts's mid-session-role-escalation
      // nudge (an admin-ish user granted their role AFTER a legacy or
      // pre-flag-flip sign-in has no fresh-enough claim here to skip that
      // nudge). Always false for a predecessor app/Admin, which never set it.
      atomicTotpEnabled: boolean;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    sub?: string;
    roles?: string[];
    features?: string[];
    isActive?: boolean;
    twoFactorRequired?: boolean;
    twoFactorVerified?: boolean;
    globalRole?: string | null;
    canCreateProjectsOverride?: boolean;
    mustChangePassword?: boolean;
    hasTotp?: boolean;
    atomicTotpEnabled?: boolean;
    /**
     * Session-freshness stamp (root docs/decisions.md DECISION-023) —
     * mirrors users.rolesVersion. JWT-only: compared against the freshly
     * read DB value in packages/auth/src/jwt.ts's computeSharedJwtClaims to
     * decide whether roles/features need re-deriving THIS request,
     * independent of the existing refreshRoles triggers. Deliberately not
     * added to Session — nothing outside jwt.ts/auth.ts ever needs to read
     * it; it is a JWT-internal freshness stamp, not a UI-facing claim.
     */
    rolesVersion?: number;
  }
}

export {};
