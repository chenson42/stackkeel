import type { OIDCConfig } from "next-auth/providers";

/**
 * Generic OIDC provider slot — enterprise SSO (Okta, Entra ID, Auth0,
 * Keycloak, ...) via plain environment configuration, no code change:
 *
 *   AUTH_OIDC_ISSUER  https://example.okta.com  (discovery via
 *                     {issuer}/.well-known/openid-configuration)
 *   AUTH_OIDC_ID      client id
 *   AUTH_OIDC_SECRET  client secret
 *   AUTH_OIDC_NAME    button label, defaults to "SSO"
 *
 * Include in an app's provider list as:
 *
 *   providers: [...,...oidcProviders()]
 *
 * `oidcProviders()` returns [] when AUTH_OIDC_ISSUER is unset, so the spread
 * is a no-op for deployments without an IdP. Requires ID and SECRET when the
 * issuer IS set — a half-configured IdP throws at startup rather than
 * failing per-request with an opaque OAuth error.
 */
export interface OidcEnv {
  issuer?: string;
  clientId?: string;
  clientSecret?: string;
  name?: string;
}

export function readOidcEnv(env: NodeJS.ProcessEnv = process.env): OidcEnv {
  return {
    issuer: env.AUTH_OIDC_ISSUER,
    clientId: env.AUTH_OIDC_ID,
    clientSecret: env.AUTH_OIDC_SECRET,
    name: env.AUTH_OIDC_NAME,
  };
}

/** Profile shape is IdP-specific; standard claims only. */
interface OidcProfile {
  sub: string;
  name?: string;
  email?: string;
  picture?: string;
}

export function oidcProviders(
  env: OidcEnv = readOidcEnv(),
): OIDCConfig<OidcProfile>[] {
  if (!env.issuer) return [];
  if (!env.clientId || !env.clientSecret) {
    throw new Error(
      "AUTH_OIDC_ISSUER is set but AUTH_OIDC_ID/AUTH_OIDC_SECRET are not — configure all three or none.",
    );
  }
  return [
    {
      id: "oidc",
      name: env.name || "SSO",
      type: "oidc",
      issuer: env.issuer,
      clientId: env.clientId,
      clientSecret: env.clientSecret,
    },
  ];
}
