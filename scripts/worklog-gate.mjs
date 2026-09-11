#!/usr/bin/env node
/**
 * Work-log gate — mechanizes the workflow rule "no code before the work-log".
 *
 * Three modes:
 *
 *   node scripts/worklog-gate.mjs --hook         (default)
 *     Claude Code PreToolUse hook on Edit|Write. Reads the tool call as JSON
 *     on stdin; if `tool_input.file_path` is a trigger path, requires a
 *     qualifying work-log under docs/work-log/. Exit 2 blocks the edit.
 *     Fails OPEN on every ambiguous condition — this is the first hook that
 *     can block an in-session edit repo-wide, so every failure mode chooses
 *     "let the edit through" over "brick the session".
 *
 *   node scripts/worklog-gate.mjs --pre-commit
 *     Git pre-commit hook (installed by scripts/install-hooks.sh) — the
 *     assistant-agnostic layer. Inspects `git diff --cached --name-only`;
 *     every staged trigger path must be covered by a qualifying work-log
 *     (mentions the path, or is same-day fresh). Exit 1 blocks the commit.
 *
 * Trigger paths (repo-root-relative):
 *   apps/<name>/(src|app|drizzle)/**   — application source & migrations
 *   packages/<name>/(src|migrations)/** — shared package source & migrations
 * scripts/**, docs/**, .claude/**, and bare config files are never triggers
 * (process tooling and evidence are not gated by themselves).
 *
 * A qualifying work-log either MENTIONS the target path or was touched TODAY
 * (same calendar date, UTC) — see isSameDayFresh(). A qualifying work-log
 * whose Phase 4/5 section is substantive (not the bare template placeholder)
 * must also carry a "## What was NOT verified" heading in that section.
 *
 * The only local exemption is `.claude/trivial-ok.json`, stamped ONLY by the
 * /trivial skill (never by an agent mid-task on its own initiative — see that
 * skill's file for the no-self-invocation rule). Single-use: consumed on the
 * matching call.
 *
 * Exported for unit testing (all pure except isSameDayFresh):
 *   isTriggerPath, extractPhaseSection, worklogMentionsPath, isSameDayFresh,
 *   hasNotVerifiedHeading, isPhaseSectionSubstantive, readTrivialMarker,
 *   trivialMarkerMatches, evaluateWorklogGate
 */
import { readFileSync, readdirSync, existsSync, unlinkSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const WORKLOG_DIR = path.join(REPO_ROOT, "docs", "work-log");
const MARKER_PATH = path.join(REPO_ROOT, ".claude", "trivial-ok.json");

// ── Constants ────────────────────────────────────────────────────────────────

// apps/*/app covers Expo Router (apps/mobile/app/**); Next.js apps keep their
// routes under src/app which src/ already covers.
export const TRIGGER_RES = [
  /^apps\/[^/]+\/(src|app|drizzle)\//,
  /^packages\/[^/]+\/(src|migrations)\//,
];

// Literal placeholder markers from docs/work-log/_template.md's unfilled
// Phase 4 / Phase 5 sections, embedded as constants rather than read from the
// template at runtime — keeps evaluateWorklogGate() a pure function with no I/O.
const PHASE4_PLACEHOLDER_MARKER = "`path/to/file` — purpose";
const PHASE5_PLACEHOLDER_MARKER =
  "[PASS | FAIL | BLOCKED — name the unmet prerequisite]";

// ── Denial messages ──────────────────────────────────────────────────────────

function rule8Message(targetPath) {
  return `[worklog-gate] BLOCKED (no code before the work-log): this change touches \`${targetPath}\`
(trigger: apps/*/src|app|drizzle or packages/*/src|migrations), but no work-log in docs/work-log/
mentions that path or was touched today.

Run /new-feature to scaffold one, or add this path to today's work-log's Surface line, then retry.

If this change is genuinely Trivial per the Classification table, ask the operator to run
\`/trivial <path> "<reason>"\` first — this gate has no self-service bypass an agent can trigger on
its own mid-task.`;
}

function notVerifiedMessage(worklogPath, phase) {
  return `[worklog-gate] BLOCKED: ${worklogPath}'s Phase ${phase} section is missing the
required "## What was NOT verified" heading.

Add the heading (docs/work-log/_template.md has the current format) before continuing.`;
}

// ── Pure helpers ─────────────────────────────────────────────────────────────

/**
 * @param {string} relativePath — repo-root-relative path
 * @returns {boolean}
 */
export function isTriggerPath(relativePath) {
  return TRIGGER_RES.some((re) => re.test(relativePath));
}

/**
 * Text between `^# Phase N —` and the next `^# Phase [1-6] —` heading, or EOF.
 *
 * @param {string} content
 * @param {number} phaseNumber — 1 through 6
 * @returns {string | null} null if no heading for this phase is found
 */
export function extractPhaseSection(content, phaseNumber) {
  const startRe = new RegExp(`^#\\s*Phase\\s*${phaseNumber}\\s*—`, "m");
  const nextRe = /^#\s*Phase\s*[1-6]\s*—/m;

  const startMatch = startRe.exec(content);
  if (!startMatch) return null;

  const rest = content.slice(startMatch.index);
  const afterHeading = rest.slice(startMatch[0].length);
  const nextMatch = nextRe.exec(afterHeading);
  if (!nextMatch) return rest;
  return rest.slice(0, startMatch[0].length + nextMatch.index);
}

/**
 * Literal substring match of the repo-relative targetPath anywhere in content.
 *
 * @param {string} content
 * @param {string} targetPath
 * @returns {boolean}
 */
export function worklogMentionsPath(content, targetPath) {
  return content.includes(targetPath);
}

/**
 * @param {string} sectionText
 * @param {4 | 5} phaseNumber
 * @returns {boolean}
 */
export function isPhaseSectionSubstantive(sectionText, phaseNumber) {
  if (sectionText === null || sectionText === undefined) return false;
  const marker =
    phaseNumber === 4 ? PHASE4_PLACEHOLDER_MARKER : PHASE5_PLACEHOLDER_MARKER;
  return !sectionText.includes(marker);
}

/**
 * @param {string} phaseSectionText
 * @returns {boolean}
 */
export function hasNotVerifiedHeading(phaseSectionText) {
  return /^##\s+What was NOT verified\s*$/im.test(phaseSectionText);
}

/**
 * Calendar-date freshness: a work-log is fresh if it has an
 * uncommitted/untracked change, OR its last commit landed on today's UTC
 * calendar date. Fails OPEN on any git-plumbing error.
 *
 * @param {string} worklogRelPath — repo-root-relative path
 * @param {string} repoRoot
 * @returns {boolean}
 */
export function isSameDayFresh(worklogRelPath, repoRoot) {
  try {
    const statusOut = execFileSync(
      "git",
      ["status", "--porcelain", "--untracked-files=normal", "--", worklogRelPath],
      { cwd: repoRoot, encoding: "utf8" },
    );
    if (statusOut.trim() !== "") return true;

    const iso = execFileSync(
      "git",
      ["log", "-1", "--format=%cI", "--", worklogRelPath],
      { cwd: repoRoot, encoding: "utf8" },
    ).trim();
    if (iso === "") return false; // never committed, and status is clean — no signal
    const commitDate = new Date(iso).toISOString().slice(0, 10);
    const todayUtc = new Date().toISOString().slice(0, 10);
    return commitDate === todayUtc;
  } catch {
    return true; // fail open — a git-plumbing failure must never brick every edit
  }
}

/**
 * @param {string} markerPath
 * @returns {{ path: string, reason: string, stampedAt: string, expiresAt: string } | null}
 */
export function readTrivialMarker(markerPath) {
  try {
    return JSON.parse(readFileSync(markerPath, "utf8"));
  } catch {
    return null;
  }
}

/**
 * @param {ReturnType<typeof readTrivialMarker>} marker
 * @param {string} targetRelativePath
 * @param {string} nowISO
 * @returns {boolean}
 */
export function trivialMarkerMatches(marker, targetRelativePath, nowISO) {
  return (
    !!marker &&
    marker.path === targetRelativePath &&
    Number.isFinite(Date.parse(marker.expiresAt)) &&
    Date.parse(nowISO) < Date.parse(marker.expiresAt)
  );
}

// ── Core pure decision function ─────────────────────────────────────────────

/**
 * @param {{
 *   targetPath: string,
 *   worklogDocsExists: boolean,
 *   worklogs: Array<{ path: string, content: string }>,
 *   isFresh: (worklogPath: string) => boolean,
 *   trivialExempt: boolean,
 * }} input
 * @returns {{ decision: "allow" | "block", reason: string }}
 */
export function evaluateWorklogGate({
  targetPath,
  worklogDocsExists,
  worklogs,
  isFresh,
  trivialExempt,
}) {
  // Step 1 — trigger check (fast exit, no fs/git work at all).
  if (!isTriggerPath(targetPath)) {
    return { decision: "allow", reason: `${targetPath} is not a trigger path` };
  }

  // Step 2 — missing docs/work-log/ directory: a fork that deleted the
  // pipeline scaffolding must not be permanently blocked with no recovery path.
  if (!worklogDocsExists) {
    return {
      decision: "allow",
      reason: "docs/work-log/ does not exist in this checkout",
    };
  }

  // Step 3 — trivial escape hatch (single-use marker, stamped only by the
  // /trivial skill).
  if (trivialExempt) {
    return { decision: "allow", reason: `trivial marker matched ${targetPath}` };
  }

  // Step 4 — work-log qualification: mentions the target path, OR is
  // same-day-fresh. `||` short-circuits, so isFresh() is only invoked when
  // the (cheap, I/O-free) mention check misses.
  const qualifying = worklogs.filter(
    (w) => worklogMentionsPath(w.content, targetPath) || isFresh(w.path),
  );
  if (qualifying.length === 0) {
    return { decision: "block", reason: rule8Message(targetPath) };
  }

  // Step 5 — "What was NOT verified" heading requirement on any qualifying
  // work-log's substantive Phase 4/5 section. Any one fully-qualifying
  // work-log is sufficient — a branch may carry an unrelated/incomplete one.
  const failing = [];
  for (const w of qualifying) {
    const phase4 = extractPhaseSection(w.content, 4);
    const phase5 = extractPhaseSection(w.content, 5);
    const substantive4 = isPhaseSectionSubstantive(phase4, 4);
    const substantive5 = isPhaseSectionSubstantive(phase5, 5);

    if (substantive4 && !hasNotVerifiedHeading(phase4)) {
      failing.push({ path: w.path, phase: 4 });
      continue;
    }
    if (substantive5 && !hasNotVerifiedHeading(phase5)) {
      failing.push({ path: w.path, phase: 5 });
      continue;
    }

    return {
      decision: "allow",
      reason: `work-log ${w.path} qualifies with no unheaded substantive Phase 4/5 section`,
    };
  }

  const first = failing[0];
  return { decision: "block", reason: notVerifiedMessage(first.path, first.phase) };
}

// ── Shared I/O glue ──────────────────────────────────────────────────────────

function collectWorklogs() {
  if (!existsSync(WORKLOG_DIR)) return [];
  return readdirSync(WORKLOG_DIR)
    .filter((f) => f.endsWith(".md") && !f.startsWith("_"))
    .map((f) => {
      const relPath = `docs/work-log/${f}`;
      let content = "";
      try {
        content = readFileSync(path.join(WORKLOG_DIR, f), "utf8");
      } catch {
        content = "";
      }
      return { path: relPath, content };
    });
}

function evaluateTarget(targetPath, { consumeTrivial }) {
  const worklogDocsExists = existsSync(WORKLOG_DIR);
  const worklogs = collectWorklogs();
  const marker = readTrivialMarker(MARKER_PATH);
  const trivialExempt = trivialMarkerMatches(marker, targetPath, new Date().toISOString());

  const result = evaluateWorklogGate({
    targetPath,
    worklogDocsExists,
    worklogs,
    isFresh: (worklogPath) => isSameDayFresh(worklogPath, REPO_ROOT),
    trivialExempt,
  });

  // Single-use: a stamped exemption never silently covers a second, unrelated
  // change. Delete on the matching call that consumed it.
  if (trivialExempt && consumeTrivial) {
    try {
      unlinkSync(MARKER_PATH);
    } catch {
      // Already gone — nothing to clean up.
    }
  }

  return result;
}

// ── Hook mode (Claude PreToolUse, fails OPEN) ───────────────────────────────

function runHook() {
  let stdinRaw = "";
  try {
    stdinRaw = readFileSync(0, "utf8");
  } catch {
    process.exit(0); // no stdin — nothing to evaluate, fail open
  }

  let filePath;
  try {
    const payload = JSON.parse(stdinRaw);
    filePath = payload?.tool_input?.file_path;
  } catch (err) {
    console.error(`[worklog-gate] warning: could not parse stdin JSON (${err.message}); allowing`);
    process.exit(0);
  }

  if (typeof filePath !== "string" || filePath === "") {
    process.exit(0);
  }

  const targetPath = path.isAbsolute(filePath)
    ? path.relative(REPO_ROOT, filePath)
    : filePath;

  if (!isTriggerPath(targetPath)) {
    process.exit(0);
  }

  const result = evaluateTarget(targetPath, { consumeTrivial: true });
  if (result.decision === "block") {
    console.error(result.reason);
    process.exit(2); // exit 2 = block; PreToolUse reads stderr as the denial reason
  }
  process.exit(0);
}

// ── Pre-commit mode (git hook, assistant-agnostic) ──────────────────────────

function runPreCommit() {
  let staged;
  try {
    staged = execFileSync("git", ["diff", "--cached", "--name-only"], {
      cwd: REPO_ROOT,
      encoding: "utf8",
    })
      .split("\n")
      .filter((l) => l.trim() !== "");
  } catch (err) {
    // Git plumbing failure inside git's own pre-commit hook is bizarre —
    // fail open rather than block every commit on a broken environment.
    console.error(`[worklog-gate] warning: could not read staged files (${err.message}); allowing`);
    process.exit(0);
  }

  const triggers = staged.filter((f) => isTriggerPath(f));
  if (triggers.length === 0) process.exit(0);

  const blocked = [];
  for (const target of triggers) {
    // Trivial marker consumed only once (on the first file it matches);
    // a single-file trivial change is the only intended use anyway.
    const result = evaluateTarget(target, { consumeTrivial: true });
    if (result.decision === "block") blocked.push({ target, reason: result.reason });
  }

  if (blocked.length > 0) {
    console.error(
      `[worklog-gate] commit blocked — ${blocked.length} staged file(s) lack work-log coverage:\n`,
    );
    // One full reason (they repeat the same guidance), then the list.
    console.error(blocked[0].reason + "\n");
    for (const b of blocked) console.error(`  • ${b.target}`);
    console.error(
      "\nStage the work-log file in the same commit, or use /trivial for a genuinely trivial change.",
    );
    process.exit(1);
  }
  process.exit(0);
}

// ── CLI wrapper ──────────────────────────────────────────────────────────────

const isMain =
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith("worklog-gate.mjs");

if (isMain) {
  if (process.argv.includes("--pre-commit")) runPreCommit();
  else runHook();
}
