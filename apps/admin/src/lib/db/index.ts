import { createDb } from "@repo/db";
import * as schema from "./schema";

// Adapter-selection factory (DECISION-026, @repo/db) — auto-selects the
// Neon vs. local Postgres driver from DATABASE_URL's hostname. This app
// passes its OWN merged schema module (re-exports @repo/db's 11 identity
// tables + this app's own account_requests/admin_invite_tokens/audit_events
// tables + every relations()), exactly mirroring
// apps/portal/src/lib/db/index.ts's own call shape — required because this
// app's code uses Drizzle's relational query builder
// (`db.query.users.findMany({ with: {...} })`), which needs the queried
// table (and its relations()) present in the schema object `drizzle()` was
// constructed with. See packages/db/src/client.ts's own header for the
// full driver-selection rationale.
export const db = createDb(process.env.DATABASE_URL, schema);
