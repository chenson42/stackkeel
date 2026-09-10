#!/usr/bin/env node
/**
 * Escape-rate reporter. Reads the 30-day git log and prints a breakdown of
 * `fix:` commits by channel (Caught-By) and discovery phase (Discovered-In).
 * A fix caught by an automated test in Phase 5 is the pipeline working; a fix
 * caught in production is an escape — this report is what the retrospective
 * review opens with.
 *
 * The "grandfather cutoff" is the date the commit-message standard was
 * introduced in this repository. Commits before that date are expected to
 * have no trailers; this script calls them out explicitly so the
 * missing-trailer count isn't mistaken for hook bypasses.
 *
 * Usage: node scripts/stats-escape.mjs
 *        pnpm stats:escape
 */
import { execSync } from "node:child_process";

import { parseTrailers } from "./commit-msg.mjs";

// ── Constants ────────────────────────────────────────────────────────────────

const GRANDFATHER_CUTOFF = "2026-09-10";

const CAUGHT_BY_VALUES = [
  "automated-test",
  "agent-review",
  "human-review",
  "production",
];

const DISCOVERED_IN_VALUES = [
  "Phase-1",
  "Phase-2",
  "Phase-3",
  "Phase-4",
  "Phase-5",
  "Phase-6",
  "post-merge",
  "production",
];

const FIX_PREFIX_RE = /^fix(\([^)]+\))?:/;

// ── Git log parsing ──────────────────────────────────────────────────────────

/**
 * @returns {{ hash: string; subject: string; body: string }[]}
 */
function fetchCommits() {
  let raw;
  try {
    raw = execSync(
      'git log --since="30 days ago" --format="%H%n%s%n%b%n---END---"',
      { encoding: "utf8" }
    );
  } catch {
    console.error("stats-escape: git log failed. Are you in a git repository?");
    process.exit(1);
  }

  const entries = raw.split("---END---");
  const commits = [];

  for (const entry of entries) {
    const lines = entry.split("\n").filter((l) => l !== "");
    if (lines.length < 2) continue;

    const hash = lines[0].trim();
    const subject = lines[1].trim();
    if (!hash || !subject) continue;

    const body = lines.slice(2).join("\n");
    commits.push({ hash, subject, body });
  }

  return commits;
}

// ── Stats accumulation ───────────────────────────────────────────────────────

function computeStats(commits) {
  let totalCommits = 0;
  let totalFix = 0;
  let fixWithTrailers = 0;
  let fixMissingTrailers = 0;

  const caughtByCounts = Object.fromEntries(CAUGHT_BY_VALUES.map((k) => [k, 0]));
  const discoveredInCounts = Object.fromEntries(
    DISCOVERED_IN_VALUES.map((k) => [k, 0])
  );

  for (const { subject, body } of commits) {
    totalCommits++;

    if (!FIX_PREFIX_RE.test(subject)) continue;
    totalFix++;

    const message = `${subject}\n\n${body}`;
    const trailers = parseTrailers(message);

    const caughtBy = trailers.get("Caught-By");
    const discoveredIn = trailers.get("Discovered-In");

    const hasValidCaughtBy = caughtBy && CAUGHT_BY_VALUES.includes(caughtBy);
    const hasValidDiscoveredIn =
      discoveredIn && DISCOVERED_IN_VALUES.includes(discoveredIn);

    if (hasValidCaughtBy && hasValidDiscoveredIn) {
      fixWithTrailers++;
      caughtByCounts[caughtBy]++;
      discoveredInCounts[discoveredIn]++;
    } else {
      fixMissingTrailers++;
    }
  }

  return {
    totalCommits,
    totalFix,
    fixWithTrailers,
    fixMissingTrailers,
    caughtByCounts,
    discoveredInCounts,
  };
}

// ── Formatting helpers ───────────────────────────────────────────────────────

function pct(count, total) {
  if (total === 0) return " (0%)";
  return ` (${Math.round((count / total) * 100)}%)`;
}

function padRight(str, width) {
  return str.padEnd(width);
}

function padLeft(str, width) {
  return String(str).padStart(width);
}

// ── Output ───────────────────────────────────────────────────────────────────

function printReport(stats) {
  const {
    totalCommits,
    totalFix,
    fixWithTrailers,
    fixMissingTrailers,
    caughtByCounts,
    discoveredInCounts,
  } = stats;

  console.log("Escape-Rate Report — 30-day window");
  console.log(
    `Grandfather cutoff: ${GRANDFATHER_CUTOFF} (commits before this date lacked trailers by design)`
  );
  console.log("");
  console.log(`Total commits (30d):        ${padLeft(totalCommits, 2)}`);
  console.log(`fix: commits (30d):          ${padLeft(totalFix, 1)}`);
  console.log(`  With trailers:             ${padLeft(fixWithTrailers, 1)}`);
  console.log(
    `  Missing trailers (bypass): ${padLeft(fixMissingTrailers, 1)}   ← hook bypassed or pre-cutoff`
  );
  console.log("");

  if (fixWithTrailers === 0) {
    console.log(
      `Caught-By breakdown (no tagged fix: commits in the last 30 days)`
    );
    CAUGHT_BY_VALUES.forEach((k) => {
      console.log(`  ${padRight(k, 16)} ${padLeft(0, 1)}   (0%)`);
    });
    console.log("");
    console.log("Discovered-In breakdown:");
    DISCOVERED_IN_VALUES.forEach((k) => {
      console.log(`  ${padRight(k, 16)} ${padLeft(0, 1)}   (0%)`);
    });
    return;
  }

  console.log(
    `Caught-By breakdown (${fixWithTrailers} tagged fix: commit${fixWithTrailers === 1 ? "" : "s"}):`
  );
  CAUGHT_BY_VALUES.forEach((k) => {
    const count = caughtByCounts[k];
    console.log(
      `  ${padRight(k, 16)} ${padLeft(count, 1)}${pct(count, fixWithTrailers)}`
    );
  });
  console.log("");
  console.log("Discovered-In breakdown:");
  DISCOVERED_IN_VALUES.forEach((k) => {
    const count = discoveredInCounts[k];
    if (count > 0) {
      console.log(
        `  ${padRight(k, 16)} ${padLeft(count, 1)}${pct(count, fixWithTrailers)}`
      );
    }
  });
}

// ── Main ─────────────────────────────────────────────────────────────────────

const commits = fetchCommits();
const stats = computeStats(commits);
printReport(stats);
