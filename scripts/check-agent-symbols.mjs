#!/usr/bin/env node
/**
 * check-agent-symbols — fails when an agent instruction file hands an agent a
 * CODE SAMPLE calling a function that does not exist.
 *
 * WHY THIS EXISTS
 * ---------------
 * `.claude/agents/*.md` are not documentation. They are instructions an agent
 * follows, and their fenced code blocks get copied more or less verbatim into
 * real files. A stale symbol there does not mislead a reader — it generates
 * code that cannot compile, or worse, code that looks right and gates nothing.
 * (In this kit's ancestor repo, five of nine agent files carried a sample
 * calling a function removed eleven days earlier — one of them the file for
 * the very agent that reviews other agents' instructions.)
 *
 * THE RULE
 * --------
 * A retired symbol may be DISCUSSED in prose — "there is no `requireRole()`"
 * is exactly the correction a stale file needs — but must never appear inside
 * a fenced code block, because that is the part agents copy.
 *
 * SELF-VALIDATING, deliberately. Each entry below is checked against the
 * repository first: if the symbol turns out to be exported somewhere after
 * all, the entry is reported as stale and ignored rather than enforced. That
 * means this list cannot become the next thing that is confidently wrong —
 * the failure mode it exists to prevent.
 *
 * Run: `node scripts/check-agent-symbols.mjs`
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const AGENT_DIR = join(REPO_ROOT, ".claude", "agents");

/**
 * Symbols retired from the codebase that must not appear in agent code
 * samples. `why` is printed on failure so the fix is obvious without needing
 * to find the work-log. Empty at kit bootstrap — add an entry when a symbol
 * agents were trained on is removed.
 *
 * @type {Array<{symbol: string, why: string}>}
 */
const RETIRED = [];

/** Is this symbol genuinely absent from the source? Keeps the list honest. */
function isActuallyRetired(symbol) {
  const searchDirs = ["apps", "packages"].filter((d) => existsSync(join(REPO_ROOT, d)));
  if (searchDirs.length === 0) return true;
  try {
    // Look for a real export, not a mention. Comments and corrective notes in
    // source files must not keep an entry alive.
    const out = execFileSync(
      "grep",
      ["-rEl", `export (async )?(function|const) ${symbol}\\b`, ...searchDirs],
      { cwd: REPO_ROOT, encoding: "utf8" },
    );
    return out.trim() === "";
  } catch {
    // grep exits non-zero when it finds nothing — which is the retired case.
    return true;
  }
}

/** Returns the fenced code blocks in a markdown file, with line numbers. */
function codeBlocks(text) {
  const lines = text.split("\n");
  const blocks = [];
  let open = null;
  lines.forEach((line, i) => {
    if (/^\s*```/.test(line)) {
      if (open === null) open = { start: i + 1, lines: [] };
      else {
        blocks.push(open);
        open = null;
      }
      return;
    }
    if (open) open.lines.push({ n: i + 1, text: line });
  });
  return blocks;
}

const violations = [];
const staleEntries = [];
const active = [];

for (const entry of RETIRED) {
  if (!isActuallyRetired(entry.symbol)) {
    staleEntries.push(entry);
    continue;
  }
  active.push(entry);
}

const agentFiles = existsSync(AGENT_DIR)
  ? readdirSync(AGENT_DIR).filter((f) => f.endsWith(".md"))
  : [];

for (const file of agentFiles) {
  const full = join(AGENT_DIR, file);
  const text = readFileSync(full, "utf8");
  for (const block of codeBlocks(text)) {
    for (const { n, text: line } of block.lines) {
      // A COMMENT inside a sample is not a call, and a comment saying "NOT
      // requireRole" is the very thing that stops an agent reverting to it.
      const isComment = /^\s*(\/\/|\*|\/\*)/.test(line);
      if (isComment) continue;
      for (const entry of active) {
        if (new RegExp(`\\b${entry.symbol}\\b`).test(line)) {
          violations.push({ file, line: n, symbol: entry.symbol, why: entry.why, src: line.trim() });
        }
      }
    }
  }
}

console.log("check:agent-symbols");
console.log(
  `  ${agentFiles.length} agent file(s), ${active.length} retired symbol(s) enforced` +
    (staleEntries.length ? `, ${staleEntries.length} list entry(ies) ignored as no longer retired` : ""),
);

for (const e of staleEntries) {
  console.log(
    `  NOTE: "${e.symbol}" is exported somewhere again — entry ignored. Remove it from RETIRED.`,
  );
}

if (violations.length === 0) {
  console.log("\ncheck:agent-symbols passed — no agent code sample calls a retired symbol.");
  process.exit(0);
}

console.error("\ncheck:agent-symbols FAILED\n");
for (const v of violations) {
  console.error(`  .claude/agents/${v.file}:${v.line}`);
  console.error(`    ${v.src}`);
  console.error(`    "${v.symbol}" ${v.why}`);
  console.error(
    `    A fenced code block is what an agent COPIES. Discussing the symbol in\n` +
      `    prose is fine; putting it in a sample is not.\n`,
  );
}
process.exit(1);
