#!/usr/bin/env node
// check-brand-scope: <BrandTokens> (packages/brand/src/brand-tokens.tsx) is
// the ONE component allowed to emit a <style> element, and NOTHING in the
// app/package tree may use dangerouslySetInnerHTML. Runtime theming that
// bypasses the emitter bypasses the contract's contrast floors and the
// closed token partition — a defect that passes tsc, next build, and a
// screenshot, which is exactly why this is a tripwire and not a review
// note.
//
// Three checks:
//   E1  packages/brand/src/brand-tokens.tsx still exists and still emits
//       (the monopoly holder can't silently vanish while call sites keep
//       compiling against a re-export).
//   E2  Every <BrandTokens mount goes through an app's runtime-brand
//       component or the emitter file itself (informational — mounts are
//       listed, not failed).
//   E3  No `<style` and no `dangerouslySetInnerHTML` anywhere in
//       apps/*/src or packages/*/src outside the emitter file.
//
// Exemption: a line (or the line above it) carrying
//   // brand-scope-ok: <reason>
// is skipped — for the rare legitimate case (e.g. an email template
// building an HTML string, which never renders in the app's DOM).

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const EMITTER = "packages/brand/src/brand-tokens.tsx";
const OK_RE = /\/\/\s*brand-scope-ok:/;

function* walk(dir) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry === "node_modules" || entry === ".next" || entry === "dist") continue;
    const full = path.join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) yield* walk(full);
    else if (/\.(tsx?|jsx?)$/.test(entry)) yield full;
  }
}

function scanRoots() {
  const roots = [];
  for (const group of ["apps", "packages"]) {
    const groupDir = path.join(repoRoot, group);
    if (!existsSync(groupDir)) continue;
    for (const child of readdirSync(groupDir)) {
      const src = path.join(groupDir, child, "src");
      if (existsSync(src)) roots.push(src);
    }
  }
  return roots;
}

const failures = [];
const mounts = [];

// E1 — the emitter exists and emits.
const emitterPath = path.join(repoRoot, EMITTER);
if (!existsSync(emitterPath)) {
  failures.push(`${EMITTER} is missing — the brand emitter monopoly holder is gone.`);
} else if (!readFileSync(emitterPath, "utf8").includes("<style>")) {
  failures.push(`${EMITTER} no longer emits a <style> element — the contract moved without this tripwire.`);
}

// E2/E3 — sweep the tree.
for (const root of scanRoots()) {
  for (const file of walk(root)) {
    const rel = path.relative(repoRoot, file);
    if (rel === EMITTER) continue;
    const lines = readFileSync(file, "utf8").split("\n");
    lines.forEach((raw, i) => {
      const prev = i > 0 ? lines[i - 1] : "";
      if (OK_RE.test(raw) || OK_RE.test(prev)) return;
      // Comments MENTION these patterns constantly (usually to forbid
      // them); only code counts. Skip block-comment lines and strip
      // line-comment tails before matching.
      const trimmed = raw.trimStart();
      if (trimmed.startsWith("*") || trimmed.startsWith("/*") || trimmed.startsWith("//")) return;
      const line = raw.replace(/\/\/.*$/, "");
      if (line.includes("<BrandTokens")) mounts.push(`${rel}:${i + 1}`);
      // Real JSX usage, not the string "<style>" inside prose: require the
      // tag shape at code level.
      if (/<style[\s>]/.test(line)) {
        failures.push(`${rel}:${i + 1} — stray <style> element (only ${EMITTER} may emit one)`);
      }
      // The attribute form only — `dangerouslySetInnerHTML={...}`.
      if (/dangerouslySetInnerHTML\s*=/.test(line)) {
        failures.push(`${rel}:${i + 1} — dangerouslySetInnerHTML is forbidden everywhere`);
      }
    });
  }
}

if (failures.length > 0) {
  console.error(`[check-brand-scope] FAIL — ${failures.length} finding(s):\n`);
  for (const f of failures) console.error(`  • ${f}`);
  console.error(
    "\nRuntime theming flows ONLY through packages/brand's BrandTokens emitter.\n" +
      "A genuinely-safe exception (e.g. server-side email HTML) may carry\n" +
      "// brand-scope-ok: <reason> on the same line or the line above.",
  );
  process.exit(1);
}

console.log(
  `[check-brand-scope] PASS — emitter intact, no stray style emission` +
    (mounts.length > 0 ? `; mounts: ${mounts.join(", ")}` : ""),
);
