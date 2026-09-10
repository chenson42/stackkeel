#!/usr/bin/env node
/**
 * sql<Date> guard. Drizzle's sql<T> tag on a COMPUTED expression (e.g.
 * COALESCE, date_trunc, NOW()) lies at runtime: the Neon serverless driver
 * returns the value as a STRING, not a Date, because there is no column OID to
 * map against. TypeScript cannot catch this — the generic is a compile-time
 * cast, not a runtime conversion.
 *
 * Scans apps/*\/src and packages/*\/src for any `sql<Date` pattern (covers
 * sql<Date>, sql<Date | null>, etc.) and requires one of:
 *   1. A `// sql-date-ok: <reason>` comment on the SAME line, or
 *   2. A `// sql-date-ok: <reason>` comment on the line DIRECTLY ABOVE.
 *
 * Fix options for a violation:
 *   - Select the real timestamp column(s) and compute the Date in JS, or
 *   - Use Drizzle's .mapWith(Date) to teach the driver the type, or
 *   - Annotate with `// sql-date-ok: <reason>` when the expression is used
 *     ONLY in WHERE/ORDER clauses and is never selected/returned to JS.
 *
 * Motivating incident (ancestor repo): a `sql<Date>` on a COALESCE expression
 * typed the value as Date at compile time but returned a string at runtime;
 * `.getTime()` threw TypeError. Not a proof; just a tripwire.
 */
import { promises as fs } from "node:fs";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function scanRoots() {
  const roots = [];
  for (const group of ["apps", "packages"]) {
    const abs = path.join(ROOT, group);
    if (!existsSync(abs)) continue;
    for (const e of readdirSync(abs, { withFileTypes: true })) {
      if (!e.isDirectory()) continue;
      const src = path.join(abs, e.name, "src");
      if (existsSync(src)) roots.push(src);
    }
  }
  return roots;
}

async function* walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(full);
    else if (e.name.endsWith(".ts") || e.name.endsWith(".tsx")) yield full;
  }
}

// Match sql<Date (covers sql<Date>, sql<Date | null>, sql<Date | undefined>…)
const SQL_DATE_RE = /sql<\s*Date\b/;
const OK_RE = /\/\/\s*sql-date-ok:/i;

const roots = scanRoots();
if (roots.length === 0) {
  console.log("sql<Date> guard: no apps/*/src or packages/*/src directories yet — skipped.");
  process.exit(0);
}

const violations = [];

for (const root of roots) {
  for await (const file of walk(root)) {
    const src = await fs.readFile(file, "utf8");
    const lines = src.split("\n");

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Comment-only lines — mentions in JSDoc are not code.
      if (line.trim().startsWith("//")) continue;
      if (!SQL_DATE_RE.test(line)) continue;

      const prevLine = i > 0 ? lines[i - 1] : "";
      if (OK_RE.test(line) || OK_RE.test(prevLine)) continue;

      violations.push({
        file: path.relative(ROOT, file),
        line: i + 1,
        text: line.trim().slice(0, 120),
      });
    }
  }
}

if (violations.length > 0) {
  console.error("sql<Date> guard FAILED — unannotated occurrence(s):\n");
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}`);
    console.error(`  > ${v.text}\n`);
  }
  console.error(
    "  sql<Date> on a computed expression returns a STRING at runtime (Neon).\n" +
      "  tsc cannot catch this. Fix: select real timestamp columns and compute\n" +
      "  in JS, use .mapWith(Date), or annotate WHERE/ORDER-only usage with\n" +
      "  // sql-date-ok: <reason>\n",
  );
  process.exit(1);
}

console.log("sql<Date> guard passed.");
