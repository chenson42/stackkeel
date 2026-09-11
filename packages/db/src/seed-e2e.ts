// Idempotent e2e seed: deterministic test users WITH passwords (and one with
// an enrolled TOTP secret) for the Playwright suites. Layered on top of the
// bootstrap seed — run `db:seed` first (the suites' global-setup runs both).
//
//   pnpm --filter @repo/db db:seed:e2e
//
// Never run against production: every identity is namespaced e2e-*@example.com
// and each suite's global-setup carries a DB-isolation guard, but the seed
// itself also refuses to run without AUTH_TOTP_ENCRYPTION_KEY (the enrolled
// admin's secret must encrypt with the same key the app server will use).
//
// Users:
//   SEED_MEMBER_EMAIL       (default e2e-member@example.com)      member, password
//   SEED_ADMIN_EMAIL        (default e2e-admin@example.com)       admin, password,
//                           TOTP enrolled with SEED_ADMIN_TOTP_SECRET so tests can
//                           mint codes via otplib
//   SEED_MFA_ADMIN_EMAIL    (default e2e-admin-fresh@example.com) admin, password,
//                           NO TOTP — proves the /setup-mfa forced-enrollment gate

import { createCipheriv, randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { createDb } from "./client";
import { roles, users, userRoles, userTotp } from "./schema";
import { ADMIN_ROLE, MEMBER_ROLE } from "@repo/permissions";

// Mirror of packages/auth/src/two-factor.ts encryptSecret() — iv(12)‖tag(16)‖ct,
// base64, AES-256-GCM under base64 AUTH_TOTP_ENCRYPTION_KEY. @repo/db cannot
// depend on @repo/auth (dependency cycle), so the ~10 lines are mirrored here;
// if the canonical layout ever changes, the admin e2e login test fails loudly
// (the server can no longer decrypt what this wrote).
function encryptTotpSecret(plain: string): string {
  const k = process.env.AUTH_TOTP_ENCRYPTION_KEY;
  if (!k) throw new Error("seed-e2e: AUTH_TOTP_ENCRYPTION_KEY is required");
  const keyBuf = Buffer.from(k, "base64");
  if (keyBuf.length !== 32) {
    throw new Error("seed-e2e: AUTH_TOTP_ENCRYPTION_KEY must decode to 32 bytes");
  }
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyBuf, iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ct]).toString("base64");
}

// Deterministic default TOTP secret (base32). Fine to be public: it guards a
// disposable e2e identity in a disposable database.
// leak-ok: RFC 4648 canonical test vector — deterministic e2e fixture, not a credential
export const DEFAULT_E2E_TOTP_SECRET = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP";

const SEEDS = [
  {
    email: process.env.SEED_MEMBER_EMAIL ?? "e2e-member@example.com",
    password: process.env.SEED_MEMBER_PASSWORD ?? "e2e-member-password-1",
    name: "E2E Member",
    role: MEMBER_ROLE,
    totpSecret: null as string | null,
  },
  {
    email: process.env.SEED_ADMIN_EMAIL ?? "e2e-admin@example.com",
    password: process.env.SEED_ADMIN_PASSWORD ?? "e2e-admin-password-1",
    name: "E2E Admin",
    role: ADMIN_ROLE,
    totpSecret: process.env.SEED_ADMIN_TOTP_SECRET ?? DEFAULT_E2E_TOTP_SECRET,
  },
  {
    email: process.env.SEED_MFA_ADMIN_EMAIL ?? "e2e-admin-fresh@example.com",
    password: process.env.SEED_MFA_ADMIN_PASSWORD ?? "e2e-admin-fresh-password-1",
    name: "E2E Admin (unenrolled)",
    role: ADMIN_ROLE,
    totpSecret: null as string | null,
  },
];

async function main() {
  const db = createDb(process.env.DATABASE_URL);

  for (const seed of SEEDS) {
    const password = await bcrypt.hash(seed.password, 10);

    const existing = await db.query.users.findFirst({
      where: eq(users.email, seed.email),
      columns: { id: true },
    });
    let userId: string;
    if (existing) {
      userId = existing.id;
      // Re-assert password + active status so a stale row can't fail a run.
      await db
        .update(users)
        .set({ password, accountStatus: "active", name: seed.name })
        .where(eq(users.id, userId));
    } else {
      const [row] = await db
        .insert(users)
        .values({
          email: seed.email,
          name: seed.name,
          password,
          accountStatus: "active",
          emailVerified: new Date(),
        })
        .returning({ id: users.id });
      userId = row.id;
    }

    const role = await db.query.roles.findFirst({ where: eq(roles.name, seed.role) });
    if (!role) throw new Error(`seed-e2e: role "${seed.role}" missing — run db:seed first`);
    await db
      .insert(userRoles)
      .values({ userId, roleId: role.id })
      .onConflictDoNothing();

    if (seed.totpSecret) {
      const secretCiphertext = encryptTotpSecret(seed.totpSecret);
      await db
        .insert(userTotp)
        .values({ userId, secretCiphertext })
        .onConflictDoUpdate({ target: userTotp.userId, set: { secretCiphertext } });
    } else {
      await db.delete(userTotp).where(eq(userTotp.userId, userId));
    }

    console.log(
      `seed-e2e: ensured ${seed.email} (${seed.role}${seed.totpSecret ? ", TOTP enrolled" : ""})`,
    );
  }

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
