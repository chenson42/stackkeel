// Admin's schema module — a plain re-export; the admin app administers the
// shared platform tables and ships no domain tables of its own. A fork's
// admin-local table would land here in an "admin" Postgres schema (see the
// portal counterpart's header for the collision rationale).
export * from "@repo/db/schema";
