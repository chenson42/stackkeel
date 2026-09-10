#!/usr/bin/env node
/**
 * Pre-push gate — mechanizes the workflow rule "run /pre-push before every
 * push" for AI sessions. (Plain-terminal pushes are separately covered by the
 * pre-push GIT hook, which runs `pnpm kit:verify` — see install-hooks.sh.)
 *
 * Two modes:
 *
 *  1. `node scripts/pre-push-gate.mjs --stamp`
 *     Run by the /pre-push skill (and by kit-verify) after clean checks.
 *     Writes .claude/pre-push-ok.json recording the HEAD the checks ran against.
 *
 *  2. No args — PreToolUse hook mode (registered in .claude/settings.json for
 *     the Bash tool). Reads the tool call as JSON on stdin; if the command is a
 *     `git push`, requires a marker stamped at the CURRENT HEAD:
 *       - marker missing  → exit 2 (blocks the push; run /pre-push first)
 *       - marker HEAD ≠ current HEAD → exit 2 (commits landed after the checks)
 *       - marker matches  → exit 0 (push proceeds)
 *     Non-push commands always exit 0. Any parse error fails OPEN (exit 0) —
 *     a broken hook must never brick every Bash call.
 *
 * Exported for unit-testing:
 *   commandContainsGitPush(command: string): boolean
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const MARKER_PATH = path.join(REPO_ROOT, ".claude", "pre-push-ok.json");

// ── Push detection ───────────────────────────────────────────────────────────

/**
 * True when the shell command invokes `git push` — i.e. `git` at command
 * position with `push` as its resolved subcommand.
 *
 * Two false-positive classes were caught live while building the original:
 *   1. a substring scan matched "git push" inside echo/grep string arguments;
 *   2. a looser \bpush\b segment scan matched `git commit -m "… pre-push …"`
 *      (hyphen is a word boundary), i.e. any commit message mentioning the gate.
 * So: split on shell separators, tokenize, skip git's own global flags, and
 * compare the resolved subcommand. Splitting is quote-naive — a quoted string
 * containing "&& git push" still trips the gate; accepted, it fails closed.
 *
 * @param {string} command - the Bash tool's command string
 * @returns {boolean}
 */
export function commandContainsGitPush(command) {
  return command.split(/[;&|\n]+/).some((segment) => {
    const tokens = segment.trim().replace(/^[({\s]+/, "").split(/\s+/);
    if (tokens[0] !== "git") return false;
    let i = 1;
    while (i < tokens.length) {
      const t = tokens[i];
      // Global flags that consume a value (git -C <path> push, git -c k=v push …)
      if (
        t === "-C" ||
        t === "-c" ||
        t === "--git-dir" ||
        t === "--work-tree" ||
        t === "--namespace"
      ) {
        i += 2;
        continue;
      }
      if (t.startsWith("-")) {
        i += 1;
        continue;
      }
      return t === "push";
    }
    return false;
  });
}

// ── Modes ────────────────────────────────────────────────────────────────────

function currentHead() {
  return execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: REPO_ROOT,
    encoding: "utf8",
  }).trim();
}

function stamp() {
  const head = currentHead();
  mkdirSync(path.dirname(MARKER_PATH), { recursive: true });
  writeFileSync(
    MARKER_PATH,
    JSON.stringify({ head, stampedAt: new Date().toISOString() }, null, 2) + "\n",
  );
  console.log(`pre-push-gate: marker stamped for HEAD ${head.slice(0, 10)}`);
  process.exit(0);
}

function hook() {
  let command = "";
  try {
    const payload = JSON.parse(readFileSync(0, "utf8"));
    command = payload?.tool_input?.command ?? "";
  } catch {
    process.exit(0); // fail open — never brick Bash on a malformed payload
  }

  if (!commandContainsGitPush(command)) process.exit(0);

  let marker = null;
  try {
    marker = JSON.parse(readFileSync(MARKER_PATH, "utf8"));
  } catch {
    // missing or unreadable marker → block below
  }

  let head;
  try {
    head = currentHead();
  } catch {
    process.exit(0); // not a git repo / git unavailable — fail open
  }

  if (!marker?.head) {
    console.error(
      "BLOCKED: no pre-push marker found.\n" +
        "Run /pre-push first — a clean 'Ready to push: yes' summary stamps the marker\n" +
        "(node scripts/pre-push-gate.mjs --stamp). Then retry the push.",
    );
    process.exit(2);
  }

  if (marker.head !== head) {
    console.error(
      `BLOCKED: pre-push marker is stale.\n` +
        `Checks ran at ${marker.head.slice(0, 10)} but HEAD is now ${head.slice(0, 10)} — ` +
        `commits landed after verification.\nRe-run /pre-push, then retry the push.`,
    );
    process.exit(2);
  }

  process.exit(0);
}

// Only run as a hook/stamp when invoked directly (not imported by tests).
const isMain =
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith("pre-push-gate.mjs");

if (isMain) {
  if (process.argv[2] === "--stamp") stamp();
  else hook();
}
