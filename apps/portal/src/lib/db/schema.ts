// Portal's schema module. The kit ships no portal-local domain tables —
// everything the portal touches today (identity, flags, email queue,
// feedback, what's-new, audit) is a shared platform table in @repo/db, so
// this file is a plain re-export. It EXISTS (rather than importing
// "@repo/db" everywhere) because a fork's first domain table lands here, in
// its own Postgres schema, without touching any existing call site:
//
//   export const portalSchema = pgSchema("portal");
//   export const widgets = portalSchema.table("widgets", { ... });
//
// Domain tables belong in an app-named Postgres schema, NOT bare "public" —
// the shared identity/platform tables own "public", and a per-app schema is
// what keeps two apps' same-named tables from colliding in one database
// (enforced by scripts/check-cross-app-table-collision.mjs once present).
export * from "@repo/db/schema";
