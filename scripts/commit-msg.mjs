#!/usr/bin/env node
/**
 * Commit-message validator. AGENTS.md § "Commit Message Standards" documents
 * the grammar this script enforces.
 *
 * Contract: git passes the path to the commit-message file as process.argv[2].
 * The script exits 0 on a valid message and 1 with a specific error on failure.
 *
 * Exported for unit-testing:
 *   validateCommitMessage(message: string): { ok: true } | { ok: false; error: string }
 *   parseTrailers(message: string): Map<string, string>
 */
import { readFileSync } from "node:fs";

// ── Grammar constants ────────────────────────────────────────────────────────

const SUBJECT_RE =
  /^(feat|fix|chore|docs|test|refactor|style|perf|build|ci)(\([^)]+\))?: .{1,100}$/;

const EXEMPTION_RE = /^(Merge |Revert |Release )/;

const ALLOWED_CAUGHT_BY = [
  "automated-test",
  "agent-review",
  "human-review",
  "production",
];

const ALLOWED_DISCOVERED_IN = [
  "Phase-1",
  "Phase-2",
  "Phase-3",
  "Phase-4",
  "Phase-5",
  "Phase-6",
  "post-merge",
  "production",
];

// Work-log slug: YYYY-MM-DD-<short-kebab-slug>, matching docs/work-log/
// filenames. Joins a commit to its pipeline so escape-rate tooling can map
// commits → work-logs mechanically instead of the retrospective
// hand-reconstructing it.
const WORK_LOG_RE = /^\d{4}-\d{2}-\d{2}-[a-z0-9][a-z0-9-]*$/;

// ── Trailer parser ───────────────────────────────────────────────────────────

/**
 * Parse Git-style trailers from the body of a commit message.
 * Trailers are `Key: value` lines that appear after the first blank line.
 * Returns a Map of key → value (last occurrence wins, matching git behaviour).
 *
 * @param {string} message - full commit message text
 * @returns {Map<string, string>}
 */
export function parseTrailers(message) {
  const trailers = new Map();
  const lines = message.split("\n");
  const blankIdx = lines.findIndex((l) => l.trim() === "");
  if (blankIdx === -1) return trailers;

  const bodyLines = lines.slice(blankIdx + 1);
  for (const line of bodyLines) {
    const match = /^([A-Za-z][A-Za-z0-9-]*):\s*(.+)$/.exec(line.trim());
    if (match) {
      trailers.set(match[1], match[2].trim());
    }
  }
  return trailers;
}

// ── Core validator ───────────────────────────────────────────────────────────

/**
 * Validate a commit message against the project grammar.
 *
 * @param {string} message - raw commit message content
 * @returns {{ ok: true } | { ok: false; error: string }}
 */
export function validateCommitMessage(message) {
  const lines = message.split("\n").filter((l) => !l.startsWith("#"));
  const subject = lines.find((l) => l.trim() !== "")?.trimEnd() ?? "";

  if (!subject) {
    return { ok: false, error: "Commit message is empty." };
  }

  if (EXEMPTION_RE.test(subject)) {
    return { ok: true };
  }

  if (!SUBJECT_RE.test(subject)) {
    return {
      ok: false,
      error:
        `Error: commit subject must match "<prefix>: <description>" (1-100 chars)\n` +
        `Allowed prefixes: feat, fix, chore, docs, test, refactor, style, perf, build, ci\n` +
        `Optional scope: feat(admin): description\n` +
        `Got: ${subject}`,
    };
  }

  const prefix = /^(feat|fix|chore|docs|test|refactor|style|perf|build|ci)/.exec(
    subject,
  )?.[1];

  const strippedMessage = lines.join("\n");
  const trailers = parseTrailers(strippedMessage);

  // Work-Log trailer: required for feat/fix (Feature and bug-fix classes always
  // have a work-log per the workflow rules); format-validated whenever present.
  if (trailers.has("Work-Log")) {
    const workLog = trailers.get("Work-Log");
    if (!WORK_LOG_RE.test(workLog)) {
      return {
        ok: false,
        error:
          `Error: Work-Log value "${workLog}" is not a valid work-log slug.\n` +
          `Expected: YYYY-MM-DD-<short-kebab-slug> (a docs/work-log/ filename without .md)\n` +
          `Example: Work-Log: 2026-09-10-kit-bootstrap`,
      };
    }
  } else if (prefix === "feat" || prefix === "fix") {
    return {
      ok: false,
      error:
        `Error: ${prefix} commits require a "Work-Log: YYYY-MM-DD-<slug>" trailer\n` +
        `naming the pipeline's work-log file (feat/fix work always has one).\n` +
        `Example: Work-Log: 2026-09-10-kit-bootstrap`,
    };
  }

  if (prefix !== "fix") {
    return { ok: true };
  }

  if (!trailers.has("Caught-By")) {
    return {
      ok: false,
      error: `Error: fix commits require a "Caught-By: <value>" trailer\nAllowed: ${ALLOWED_CAUGHT_BY.join(", ")}`,
    };
  }

  const caughtBy = trailers.get("Caught-By");
  if (!ALLOWED_CAUGHT_BY.includes(caughtBy)) {
    return {
      ok: false,
      error:
        `Error: Caught-By value "${caughtBy}" is not valid.\n` +
        `Allowed: ${ALLOWED_CAUGHT_BY.join(", ")}`,
    };
  }

  if (!trailers.has("Discovered-In")) {
    return {
      ok: false,
      error: `Error: fix commits require a "Discovered-In: <value>" trailer\nAllowed: ${ALLOWED_DISCOVERED_IN.join(", ")}`,
    };
  }

  const discoveredIn = trailers.get("Discovered-In");
  if (!ALLOWED_DISCOVERED_IN.includes(discoveredIn)) {
    return {
      ok: false,
      error:
        `Error: Discovered-In value "${discoveredIn}" is not valid.\n` +
        `Allowed: ${ALLOWED_DISCOVERED_IN.join(", ")}`,
    };
  }

  return { ok: true };
}

// ── Hook entry point ─────────────────────────────────────────────────────────

const isMain =
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith("commit-msg.mjs");

if (isMain && process.argv[2]) {
  const msgPath = process.argv[2];
  let message;
  try {
    message = readFileSync(msgPath, "utf8");
  } catch (err) {
    console.error(`commit-msg: could not read file "${msgPath}": ${err.message}`);
    process.exit(1);
  }

  const result = validateCommitMessage(message);
  if (!result.ok) {
    console.error(result.error);
    process.exit(1);
  }
  process.exit(0);
}
