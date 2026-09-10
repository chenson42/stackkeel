// Idempotent bootstrap seed: roles, the feature catalog, role→feature
// grants, and initial admin users. Safe to run on every deploy.
//
//   pnpm --filter @repo/db db:seed
//
// Initial admins come from INITIAL_ADMIN_EMAILS (comma-separated). Each
// address gets a user row (accountStatus 'invited' — they complete sign-in
// via Google/OIDC or a password-reset flow) and the admin role. The admin
// role's features are NOT seeded from the DB catalog — code is the source of
// truth for the admin grant (packages/auth/src/jwt.ts hands admins every
// FEATURES key at session time). role_features rows are seeded for the
// member role only.

import { eq } from "drizzle-orm";
import { createDb } from "./client";
import {
  roles,
  users,
  userRoles,
  features as featuresTable,
  roleFeatures,
} from "./schema";
import {
  ADMIN_ROLE,
  MEMBER_ROLE,
  FEATURE_CATALOG,
  MEMBER_DEFAULT_FEATURES,
} from "@repo/permissions";

async function main() {
  const db = createDb(process.env.DATABASE_URL);

  // Roles. isSystem so the admin UI refuses to delete them.
  const roleSeeds = [
    {
      name: ADMIN_ROLE,
      displayName: "Administrator",
      description: "Full access to every feature, including the admin app.",
      isSystem: true,
      sortOrder: 0,
    },
    {
      name: MEMBER_ROLE,
      displayName: "Member",
      description: "Default role for signed-up users.",
      isSystem: true,
      sortOrder: 100,
    },
  ];
  for (const seed of roleSeeds) {
    await db.insert(roles).values(seed).onConflictDoNothing({ target: roles.name });
  }
  console.log(`roles: ensured ${roleSeeds.map((r) => r.name).join(", ")}`);

  // Feature catalog — upsert so renamed descriptions propagate.
  for (const f of FEATURE_CATALOG) {
    await db
      .insert(featuresTable)
      .values({
        key: f.key,
        name: f.name,
        description: f.description,
        category: f.category,
      })
      .onConflictDoUpdate({
        target: featuresTable.key,
        set: { name: f.name, description: f.description, category: f.category },
      });
  }
  console.log(`features: ensured ${FEATURE_CATALOG.length} catalog entries`);

  // Member default grants (insert-only; operators may revoke later and a
  // reseed must not silently re-grant what an operator removed — hence
  // onConflictDoNothing rather than delete-and-recreate).
  const [memberRole] = await db
    .select({ id: roles.id })
    .from(roles)
    .where(eq(roles.name, MEMBER_ROLE))
    .limit(1);
  if (memberRole) {
    for (const key of MEMBER_DEFAULT_FEATURES) {
      await db
        .insert(roleFeatures)
        .values({ roleId: memberRole.id, featureKey: key })
        .onConflictDoNothing();
    }
  }

  // Initial admins.
  const adminEmails = (process.env.INITIAL_ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (adminEmails.length === 0) {
    console.log("INITIAL_ADMIN_EMAILS not set — skipping admin bootstrap");
    return;
  }

  const [adminRole] = await db
    .select({ id: roles.id })
    .from(roles)
    .where(eq(roles.name, ADMIN_ROLE))
    .limit(1);
  if (!adminRole) throw new Error("admin role missing after seed");

  for (const email of adminEmails) {
    let [user] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    if (!user) {
      // 'invited': no password is set here — the user completes sign-in via
      // Google/OIDC (email match) or a password-reset flow.
      [user] = await db
        .insert(users)
        .values({ email, accountStatus: "invited" })
        .returning({ id: users.id });
    }
    await db
      .insert(userRoles)
      .values({ userId: user.id, roleId: adminRole.id })
      .onConflictDoNothing();
    console.log(`admin: ensured ${email}`);
  }
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
