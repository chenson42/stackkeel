#!/usr/bin/env node
// Applies migrations/*.sql in filename order, recording applied files in
// schema_migrations. Plain ordered SQL + a tracking table — see README.md for
// why this is deliberately not drizzle-kit's journal format (personalization
// must be able to delete a stripped module's migration files wholesale).
//
// Uses DIRECT_DATABASE_URL when set (an unpooled connection — DDL through a
// pooler can deadlock), else DATABASE_URL.

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const dir = path.dirname(fileURLToPath(import.meta.url));
const url = process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL (or DIRECT_DATABASE_URL) is not set.");
  process.exit(1);
}

const isLocal = (() => {
  try {
    const { hostname } = new URL(url);
    return ["localhost", "127.0.0.1", "0.0.0.0"].includes(hostname);
  } catch {
    return false;
  }
})();

const client = new pg.Client({
  connectionString: url,
  ...(isLocal ? {} : { ssl: { rejectUnauthorized: true } }),
});

const files = readdirSync(dir)
  .filter((f) => f.endsWith(".sql"))
  .sort();

try {
  await client.connect();
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  const { rows } = await client.query("SELECT filename FROM schema_migrations");
  const applied = new Set(rows.map((r) => r.filename));

  let ran = 0;
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = readFileSync(path.join(dir, file), "utf8");
    process.stdout.write(`applying ${file} ... `);
    await client.query("BEGIN");
    try {
      await client.query(sql);
      await client.query(
        "INSERT INTO schema_migrations (filename) VALUES ($1)",
        [file],
      );
      await client.query("COMMIT");
      console.log("ok");
      ran++;
    } catch (err) {
      await client.query("ROLLBACK");
      console.log("FAILED");
      throw err;
    }
  }
  console.log(
    ran === 0 ? "migrations: up to date" : `migrations: applied ${ran} file(s)`,
  );
} finally {
  await client.end();
}
