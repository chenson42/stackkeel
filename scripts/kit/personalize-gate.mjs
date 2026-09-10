#!/usr/bin/env node
// personalize-gate: Claude PreToolUse hook on Write|Edit. While this working
// copy is an UNPERSONALIZED starter copy (see kit-check.mjs), source edits
// under apps/, packages/, and drizzle/ are blocked so the first act in a
// fresh copy is /personalize (or an explicit decline via
// kit.json identity.personalizationDeclined = true).
//
// Everything else stays editable — kit.json, docs/**, .env*, .claude/**, and
// scripts/** — because those are exactly the files personalization itself
// (or the decline) needs to touch.
//
// Fails OPEN on any internal error: a broken gate must never brick the
// session. Exit 2 blocks the tool call; stderr is shown as the reason.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { checkKit } from "./kit-check.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

const BLOCKED_PREFIXES = ["apps/", "packages/", "drizzle/"];

try {
  const { state } = checkKit();
  if (state !== "UNPERSONALIZED") process.exit(0);

  let filePath;
  try {
    const payload = JSON.parse(readFileSync(0, "utf8"));
    filePath = payload?.tool_input?.file_path;
  } catch {
    process.exit(0); // unparseable stdin — fail open
  }
  if (typeof filePath !== "string" || filePath === "") process.exit(0);

  const rel = path.isAbsolute(filePath) ? path.relative(ROOT, filePath) : filePath;
  if (rel.startsWith("..")) process.exit(0); // outside the repo — not ours to gate

  if (BLOCKED_PREFIXES.some((p) => rel.startsWith(p))) {
    console.error(
      `[personalize-gate] BLOCKED: this is an unpersonalized starter copy — source edits are\n` +
        `paused until it has an identity of its own.\n\n` +
        `Run /personalize (.claude/skills/personalize/SKILL.md) to rebrand this copy, or set\n` +
        `identity.personalizationDeclined = true in kit.json to opt out deliberately.\n` +
        `Details: pnpm kit:check --why`,
    );
    process.exit(2);
  }
  process.exit(0);
} catch {
  process.exit(0); // any internal error — fail open
}
