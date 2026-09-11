// Shared result shape for CredentialsSignInForm/TotpVerifyForm submission
// props (2026-09-04-shared-login-component, Increment A, Phase 3 API
// Contract). A single, deliberately narrow type — success is communicated
// by the caller's own server action performing its own redirect() (per
// Phase 2's ruling that packages/auth does not own a shared authorize() or
// a shared credentials action); this component only ever needs to know
// "did it fail, and if so, what do I show."
export type AuthFormResult = { error: string } | undefined;
