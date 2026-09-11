#!/usr/bin/env node
/**
 * Tripwire orchestrator — `pnpm check`.
 *
 * Runs every mechanical-invariant tripwire as a child process and prints a
 * PASS/FAIL summary. Each tripwire is itself responsible for skipping
 * gracefully when its target directories don't exist yet (early bootstrap);
 * this orchestrator only aggregates exit codes.
 *
 * Exit 0 = every tripwire passed (or skipped), 1 = at least one failed.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPTS_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPTS_DIR, "..");

const TRIPWIRES = [
  "check-instructions.mjs",
  "check-agent-symbols.mjs",
  "check-secrets.mjs",
  "check-sql-date.mjs",
  "check-brand-scope.mjs",
  "kit/check-identity-files.mjs",
];

const results = [];

for (const script of TRIPWIRES) {
  const abs = path.join(SCRIPTS_DIR, script);
  if (!existsSync(abs)) {
    results.push({ script, status: "SKIP", note: "script not found" });
    continue;
  }
  const run = spawnSync("node", [abs], { cwd: ROOT, encoding: "utf8" });
  const passed = run.status === 0;
  results.push({
    script,
    status: passed ? "PASS" : "FAIL",
    output: passed ? null : `${run.stdout ?? ""}${run.stderr ?? ""}`.trim(),
  });
}

console.log("tripwires:");
for (const r of results) {
  console.log(`  ${r.status === "PASS" ? "✓" : r.status === "SKIP" ? "-" : "✗"} ${r.script} ${r.status}${r.note ? ` (${r.note})` : ""}`);
}

const failures = results.filter((r) => r.status === "FAIL");
if (failures.length > 0) {
  console.error("");
  for (const f of failures) {
    console.error(`── ${f.script} ──`);
    console.error(f.output);
    console.error("");
  }
  process.exit(1);
}
process.exit(0);
