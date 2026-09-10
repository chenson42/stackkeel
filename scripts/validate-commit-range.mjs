#!/usr/bin/env node
/**
 * CI-side commit-grammar validation. The commit-msg git hook
 * (scripts/commit-msg.mjs) only runs where `pnpm install` has installed it —
 * GitHub web edits, fresh clones pre-install, and any hookless environment
 * bypass it silently, and stats:escape only detects that after the fact. This
 * script closes the gap by validating every commit in a range with the same
 * exported validator the hook uses.
 *
 * Commits authored before GRANDFATHER_CUTOFF (the date the standard was
 * adopted in this repository) are skipped, so history imported from before
 * the standard never fails CI.
 *
 * Usage: node scripts/validate-commit-range.mjs "<rev-range>"
 *   e.g. node scripts/validate-commit-range.mjs "origin/main..HEAD"
 *
 * Exits 0 when every commit in the range passes, 1 otherwise (listing failures).
 */
import { execFileSync } from "node:child_process";
import { validateCommitMessage } from "./commit-msg.mjs";

const GRANDFATHER_CUTOFF = "2026-09-10";

const range = process.argv[2];
if (!range) {
  console.error('Usage: node scripts/validate-commit-range.mjs "<rev-range>"');
  process.exit(1);
}

// %H = hash; %cs = committer date (YYYY-MM-DD); %B = raw body.
// Null-delimit records so multi-line messages parse safely.
const raw = execFileSync(
  "git",
  ["log", "--format=%H %cs%n%B%x00", "--no-merges", range],
  { encoding: "utf8" },
);

const records = raw.split("\0").map((r) => r.trim()).filter(Boolean);
const failures = [];
let skipped = 0;
let checked = 0;

for (const record of records) {
  const newline = record.indexOf("\n");
  const header = (newline === -1 ? record : record.slice(0, newline)).trim();
  const [hash, date] = header.split(" ");
  const message = newline === -1 ? "" : record.slice(newline + 1);

  if (date && date < GRANDFATHER_CUTOFF) {
    skipped++;
    continue;
  }
  checked++;

  const result = validateCommitMessage(message);
  if (!result.ok) {
    failures.push({ hash, error: result.error, subject: message.split("\n")[0] });
  }
}

if (failures.length === 0) {
  const skippedNote = skipped > 0 ? ` (${skipped} pre-cutoff commit(s) skipped)` : "";
  console.log(`commit-grammar: ${checked} commit(s) in ${range} — all valid${skippedNote}.`);
  process.exit(0);
}

console.error(`commit-grammar: ${failures.length} of ${checked} commit(s) failed:\n`);
for (const { hash, subject, error } of failures) {
  console.error(`✗ ${hash.slice(0, 10)} ${subject}`);
  console.error(`  ${error.split("\n").join("\n  ")}\n`);
}
process.exit(1);
