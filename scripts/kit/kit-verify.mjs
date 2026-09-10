#!/usr/bin/env node
// kit-verify: the binding verification pass — what the pre-push git hook runs
// (`pnpm kit:verify`), and what the /pre-push skill wraps with its richer
// per-app reporting. Runs, in order:
//
//   1. turbo typecheck + lint + test across the workspace (skipped with a
//      note when turbo isn't installed yet — early bootstrap)
//   2. unit tests for the scripts/ layer itself (node --test)
//   3. the tripwire suite (scripts/run-tripwires.mjs)
//
// On full success, stamps .claude/pre-push-ok.json at the current HEAD so the
// Claude-side pre-push gate agrees the tree was verified.
//
// Exit 0 = verified (+ stamped), 1 = something failed (no stamp).

import { spawnSync, execFileSync } from "node:child_process";
import { existsSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function step(name, cmd, args, opts = {}) {
  console.log(`\n▶ ${name}`);
  const run = spawnSync(cmd, args, { cwd: ROOT, stdio: "inherit", ...opts });
  if (run.error) {
    console.error(`kit-verify: ${name} could not start (${run.error.message})`);
    return false;
  }
  return run.status === 0;
}

let ok = true;

// 1 — workspace-wide typecheck/lint/test via turbo. Tolerates the bootstrap
// state: no node_modules yet, or no package implements the tasks.
const turboBin = path.join(ROOT, "node_modules", ".bin", "turbo");
if (existsSync(turboBin)) {
  ok = step("turbo typecheck + lint + test", turboBin, ["run", "typecheck", "lint", "test"]) && ok;
} else {
  console.log("▶ turbo not installed yet (pnpm install) — workspace tasks skipped");
}

// 2 — unit tests for the scripts layer. node --test discovers *.test.mjs.
const hasScriptTests = readdirSync(path.join(ROOT, "scripts")).some((f) =>
  f.endsWith(".test.mjs"),
);
if (hasScriptTests) {
  ok = step("scripts unit tests", "node", ["--test", "scripts/*.test.mjs"]) && ok;
}

// 3 — tripwires.
ok = step("tripwires", "node", [path.join(ROOT, "scripts", "run-tripwires.mjs")]) && ok;

if (!ok) {
  console.error("\nkit-verify: FAILED — fix the failures above; nothing was stamped.");
  process.exit(1);
}

// Stamp the pre-push marker at the current HEAD (skipped gracefully when not
// in a git repo, e.g. an exported tarball).
try {
  const head = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: ROOT,
    encoding: "utf8",
  }).trim();
  const markerPath = path.join(ROOT, ".claude", "pre-push-ok.json");
  mkdirSync(path.dirname(markerPath), { recursive: true });
  writeFileSync(
    markerPath,
    JSON.stringify({ head, stampedAt: new Date().toISOString() }, null, 2) + "\n",
  );
  console.log(`\nkit-verify: PASSED — marker stamped for HEAD ${head.slice(0, 10)}.`);
} catch {
  console.log("\nkit-verify: PASSED (no git HEAD to stamp).");
}
process.exit(0);
