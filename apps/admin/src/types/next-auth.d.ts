import type { DefaultSession } from "next-auth";

// Canonical session/JWT claim shape. packages/auth is typechecked as its own
// standalone TS project (its tsconfig only includes this package's src), so
// it needs its own module augmentation. Each app carries its OWN copy of
// this file under src/types/ — ambient .d.ts augmentations don't cross a
// workspace-package boundary automatically — and must keep it in lockstep
// with this one.
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      roles: string[];
      features: string[];
      isActive: boolean;
      twoFactorRequired: boolean;
      twoFactorVerified: boolean;
      // Force a password change after first login / admin reset.
      // Credentials-only concept; always false for OAuth-native users.
      mustChangePassword: boolean;
      // Does this user have a confirmed TOTP enrollment.
      hasTotp: boolean;
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
    mustChangePassword?: boolean;
    hasTotp?: boolean;
    /**
     * Session-freshness stamp — mirrors users.rolesVersion. JWT-only:
     * compared against the freshly read DB value in computeSharedJwtClaims
     * to decide whether roles/features need re-deriving THIS request.
     * Deliberately not added to Session — it is a JWT-internal freshness
     * stamp, not a UI-facing claim.
     */
    rolesVersion?: number;
  }
}

export {};
