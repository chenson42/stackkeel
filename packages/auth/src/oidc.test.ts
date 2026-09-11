import { describe, it, expect } from "vitest";
import { oidcProviders, readOidcEnv } from "./oidc";

describe("oidcProviders", () => {
  it("returns [] when no issuer is configured (spread is a no-op)", () => {
    expect(oidcProviders({})).toEqual([]);
    expect(oidcProviders({ clientId: "x", clientSecret: "y" })).toEqual([]);
  });

  it("throws on a half-configured IdP rather than failing per-request", () => {
    expect(() => oidcProviders({ issuer: "https://idp.example.com" })).toThrow(
      /AUTH_OIDC_ID/,
    );
    expect(() =>
      oidcProviders({ issuer: "https://idp.example.com", clientId: "x" }),
    ).toThrow();
  });

  it("returns one OIDC provider when fully configured", () => {
    const [provider] = oidcProviders({
      issuer: "https://idp.example.com",
      clientId: "client",
      clientSecret: "secret",
      name: "Acme SSO",
    });
    expect(provider).toMatchObject({
      id: "oidc",
      type: "oidc",
      name: "Acme SSO",
      issuer: "https://idp.example.com",
    });
  });

  it("defaults the button label to SSO", () => {
    const [provider] = oidcProviders({
      issuer: "https://idp.example.com",
      clientId: "client",
      clientSecret: "secret",
    });
    expect(provider.name).toBe("SSO");
  });

  it("readOidcEnv maps the four env vars", () => {
    const env = readOidcEnv({
      AUTH_OIDC_ISSUER: "https://idp.example.com",
      AUTH_OIDC_ID: "id",
      AUTH_OIDC_SECRET: "secret",
      AUTH_OIDC_NAME: "Corp",
    } as unknown as NodeJS.ProcessEnv);
    expect(env).toEqual({
      issuer: "https://idp.example.com",
      clientId: "id",
      clientSecret: "secret",
      name: "Corp",
    });
  });
});
