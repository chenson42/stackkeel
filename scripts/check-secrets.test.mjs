/**
 * Unit tests for the secrets tripwire's pure core. Fixtures below are
 * SYNTHETIC secret-shaped strings — this file is excluded from the CLI scan
 * by exact path (SELF_TEST_EXEMPT_PATH) precisely because HARD findings have
 * no annotation escape hatch.
 *
 * Run via: node --test scripts/
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { checkSecrets } from "./check-secrets.mjs";

const file = (content) => [{ path: "src/example.ts", content }];

describe("checkSecrets — HARD tier", () => {
  it("flags a private key block", () => {
    const v = checkSecrets(file("-----BEGIN RSA PRIVATE KEY-----"));
    assert.equal(v.length, 1);
    assert.equal(v[0].tier, "hard");
  });

  it("flags an AWS access key ID", () => {
    const v = checkSecrets(file("const k = 'AKIAIOSFODNN7EXAMPLE';"));
    assert.ok(v.some((x) => x.label === "AWS access key ID"));
  });

  it("flags a GitHub token even with a leak-ok annotation (no HARD escape hatch)", () => {
    const v = checkSecrets(file("// leak-ok: nope\nconst t = 'ghp_abcdefghijklmnopqrstu012345';"));
    assert.ok(v.some((x) => x.label === "GitHub token"));
  });

  it("flags a JWT-shaped token", () => {
    const v = checkSecrets(
      file("token = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkifQ.SflKxwRJSMeKKF2QT4fwpM';"),
    );
    assert.ok(v.some((x) => x.label === "JWT-shaped token"));
  });
});

describe("checkSecrets — SOFT tier", () => {
  it("flags a real-looking secret assignment", () => {
    const v = checkSecrets(file('AUTH_SECRET="kJ9mPqRt7wXyZ2aB4cD6eF8g"'));
    assert.equal(v.length, 1);
    assert.equal(v[0].tier, "soft");
  });

  it("skips placeholder values", () => {
    assert.equal(checkSecrets(file('AUTH_SECRET="changeme-in-production"')).length, 0);
    assert.equal(checkSecrets(file("AUTH_SECRET=${AUTH_SECRET}")).length, 0);
    assert.equal(checkSecrets(file('AUTH_SECRET="your-secret-here"')).length, 0);
  });

  it("honors a same-line leak-ok annotation", () => {
    const v = checkSecrets(
      file('AUTH_SECRET="kJ9mPqRt7wXyZ2aB4cD6eF8g" // leak-ok: doc sample, rotated'),
    );
    assert.equal(v.length, 0);
  });

  it("honors a line-above leak-ok annotation", () => {
    const v = checkSecrets(
      file('// leak-ok: doc sample, rotated\nAUTH_SECRET="kJ9mPqRt7wXyZ2aB4cD6eF8g"'),
    );
    assert.equal(v.length, 0);
  });

  it("flags a connection string with embedded credentials", () => {
    const v = checkSecrets(file("postgres://appuser:realpassword99@db.host.tld/prod"));
    assert.ok(v.some((x) => x.label.includes("connection string")));
  });

  it("skips the ci:ci@localhost convention", () => {
    const v = checkSecrets(file('DATABASE_URL="postgres://ci:ci@localhost:5432/ci"'));
    assert.equal(v.filter((x) => x.label.includes("connection string")).length, 0);
  });
});

describe("checkSecrets — email allowlist", () => {
  it("flags an email outside the allowlist", () => {
    const v = checkSecrets(file("contact: someone@realcompany.com"));
    assert.equal(v.length, 1);
    assert.match(v[0].label, /email outside/);
  });

  it("allows example.com and .invalid", () => {
    assert.equal(checkSecrets(file("admin@example.com and x@test.invalid")).length, 0);
  });

  it("allows git SSH remote shapes", () => {
    assert.equal(checkSecrets(file("git clone git@github.com:owner/repo.git")).length, 0);
  });

  it("allows connection-string local parts", () => {
    assert.equal(checkSecrets(file("host part user@db.internal.example looks odd")).length, 0);
  });

  it("allows email-shaped filenames (asset-catalog scale suffixes)", () => {
    assert.equal(
      checkSecrets(file('"filename" : "AppIcon-512@2x.png", plus logo@3x.webp')).length,
      0,
    );
  });

  it("honors leak-ok on an email line", () => {
    const v = checkSecrets(file("<!-- leak-ok: public contact -->\nwrite hello@somewhere.org"));
    assert.equal(v.length, 0);
  });
});
