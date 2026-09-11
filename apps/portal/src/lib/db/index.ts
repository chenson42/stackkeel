import { createDb } from "@repo/db";
import * as schema from "./schema";

// Milestone 1 of the portal consolidation (Identity/Permissions Merge):
// the Neon/pg adapter-selection factory moved to @repo/db so both apps can
// instantiate it from their own DATABASE_URL env var against the same
// physical shared-identity database. See
// docs/work-log/2026-08-27-monorepo-milestone-1-identity.md Phase 3 → Data
// Model → packages/db's real content.
//
// Portal passes its OWN merged schema module (./schema.ts, which re-exports
// @repo/db's identity tables and additionally declares Portal's local
// domain tables — projects/tasks/labels/etc. — plus every `relations()`)
// rather than relying on createDb()'s identity-only default, because
// Portal's domain code uses drizzle's relational query builder
// (`db.query.projects.findMany(...)` etc.), which requires the queried
// table to be present in the schema object `drizzle()` was constructed
// with. See packages/db/src/client.ts's header for the full rationale.
export const db = createDb(process.env.DATABASE_URL, schema);
