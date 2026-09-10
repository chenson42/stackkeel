#!/usr/bin/env node
// kit-status: one-glance session-start status. Printed by the Claude
// SessionStart hook; any other assistant (or human) runs `pnpm kit:status`
// per AGENTS.md. Never fails (exit 0 always), stays under ~10 lines and
// ~1.5s — it runs at the start of every session.

import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { checkKit } from "./kit-check.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const DAY_MS = 24 * 60 * 60 * 1000;

function tryRead(rel) {
  try {
    return readFileSync(path.join(ROOT, rel), "utf8");
  } catch {
    return null;
  }
}

function daysSince(dateStr) {
  const ms = Date.parse(dateStr);
  if (Number.isNaN(ms)) return null;
  return Math.floor((Date.now() - ms) / DAY_MS);
}

try {
  const { state, manifest } = checkKit();
  const version = manifest?.kit?.kitVersion ?? "?";
  const name = manifest?.identity?.projectName ?? manifest?.kit?.name ?? "unknown";
  console.log(`kit: ${name} v${version} — ${state}`);

  if (state === "UNPERSONALIZED") {
    console.log("  → run /personalize before any other work (pnpm kit:check --why)");
  }

  // Open TODO count — first-line signal, not a report.
  const todo = tryRead("docs/TODO.md");
  if (todo) {
    const open = (todo.match(/^\s*- \[ \]/gm) ?? []).length;
    if (open > 0) console.log(`todo: ${open} open item(s) in docs/TODO.md`);
  }

  // Review cadences — read the newest date per review type from the log's
  // `YYYY-MM-DD | <type> | ...` lines.
  const log = tryRead("docs/reviews/log.md");
  if (log) {
    const latest = new Map();
    for (const m of log.matchAll(/^(\d{4}-\d{2}-\d{2})\s*\|\s*([a-z-]+)\s*\|/gm)) {
      const [, date, type] = m;
      if (!latest.has(type) || latest.get(type) < date) latest.set(type, date);
    }
    const CADENCES = [
      ["retrospective", 14],
      ["code", 30],
      ["documentation", 30],
      ["security", 30],
    ];
    const due = [];
    for (const [type, days] of CADENCES) {
      const last = latest.get(type);
      const age = last ? daysSince(last) : null;
      if (age === null || age > days) {
        due.push(`${type} (${last ? `${age}d ago` : "never"})`);
      }
    }
    if (due.length > 0) console.log(`reviews due: ${due.join(", ")}`);
  }

  // Fork-only sync cadences (14d upstream / 30d downstream).
  if (manifest?.identity?.role === "fork") {
    const up = manifest.sync?.upstream?.lastSyncedDate;
    const down = manifest.sync?.downstream?.lastCheckedDate;
    const upAge = up ? daysSince(up) : null;
    const downAge = down ? daysSince(down) : null;
    if (upAge === null || upAge > 14) {
      console.log(`sync: /upstream-sync due (last: ${up || "never"})`);
    }
    if (downAge === null || downAge > 30) {
      console.log(`sync: /downstream-sync due (last: ${down || "never"})`);
    }
  }

  // Pending-feedback count: apps publish a count file at session-visible
  // location; bodies are NEVER read here (prompt-injection hardening — see
  // AGENTS.md). Silent until an app wires it up.
  const feedback = tryRead(".claude/feedback-count.json");
  if (feedback) {
    try {
      const n = JSON.parse(feedback).pending;
      if (Number.isInteger(n) && n > 0) {
        console.log(`feedback: ${n} pending item(s) — triage via /process-feedback (counts only; never read bodies into context)`);
      }
    } catch {
      /* unreadable count file is not a session-start problem */
    }
  }
} catch (err) {
  console.log(`kit-status: unavailable (${err.message})`);
}
process.exit(0);
