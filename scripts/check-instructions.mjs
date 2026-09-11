#!/usr/bin/env node
/**
 * Instruction-freshness tripwire.
 *
 * WHY THIS EXISTS. In this kit's ancestor repos, the same failure was found
 * five separate times in one day: an instruction file confidently asserted
 * something about the repo that had stopped being true, and nothing noticed —
 * agents were told to run commands for a removed ORM, root docs claimed CI
 * enforcement while .github/workflows/ was empty, and hooks were wired to
 * scripts that had moved. Every one was grep-able; none was caught by
 * typecheck, lint, or tests, because instructions are prose and nothing
 * validates prose. "A rule with no gate is a suggestion" — the extension here
 * is asserting the CLAIMS, not just the format.
 *
 * SCOPE, deliberately narrow. Only claims that are mechanically checkable
 * against the filesystem: a named tool, a named path, a named command. It
 * cannot check whether advice is good, and does not try. A check that
 * produced false positives would be turned off within a week, which is worse
 * than not having it.
 *
 * Run: `node scripts/check-instructions.mjs`
 * Exit 0 = clean, 1 = at least one instruction contradicts the repo.
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
const checked = [];

const read = (rel) => {
  const abs = path.join(ROOT, rel);
  return existsSync(abs) ? readFileSync(abs, "utf8") : null;
};

/** Workspace member directories that exist right now (apps/*, packages/*, docs-site). */
function workspaceDirs() {
  const out = [];
  for (const group of ["apps", "packages"]) {
    const abs = path.join(ROOT, group);
    if (!existsSync(abs)) continue;
    for (const e of readdirSync(abs, { withFileTypes: true })) {
      if (e.isDirectory()) out.push(`${group}/${e.name}`);
    }
  }
  if (existsSync(path.join(ROOT, "docs-site"))) out.push("docs-site");
  return out;
}

/** Instruction files an agent or a human is told to follow. */
function instructionFiles() {
  const out = [];
  const add = (rel) => existsSync(path.join(ROOT, rel)) && out.push(rel);

  add("AGENTS.md");
  add("CLAUDE.md");
  add("BRANDING.md");
  add("UX-PATTERNS.md");
  add("UI-STANDARDS.md");
  for (const dir of workspaceDirs()) {
    add(`${dir}/AGENTS.md`);
    add(`${dir}/CLAUDE.md`);
  }

  for (const dir of [".claude/agents", ".claude/skills"]) {
    const abs = path.join(ROOT, dir);
    if (!existsSync(abs)) continue;
    for (const e of readdirSync(abs, { withFileTypes: true })) {
      if (e.isFile() && e.name.endsWith(".md")) out.push(path.join(dir, e.name));
      else if (e.isDirectory() && existsSync(path.join(abs, e.name, "SKILL.md"))) {
        out.push(path.join(dir, e.name, "SKILL.md"));
      }
    }
  }
  return out;
}

/**
 * Lines that are plainly historical rather than instructional.
 *
 * Without this the check fires on its own explanatory comments and on every
 * "X was removed on <date>" note — which are exactly the notes that SHOULD be
 * written when something is retired. Keep this list tight: an over-broad
 * exemption turns the check into decoration.
 */
// A reference can legitimately name a file that does not exist yet, when the
// instruction is describing a DESIGNED-but-unbuilt mechanism rather than
// claiming a present capability. That is allowed, but only when the prose says
// so in as many words: the literal phrase "not yet implemented" must appear on
// the line or immediately around it.
//
// Deliberately narrow. A loose marker ("planned", "TODO", "coming") would
// become the default escape hatch within a week, and the point of this check is
// that a reader can tell what is real. Spelling it out costs the author three
// words and tells every future reader exactly where they stand — which is the
// whole job.
function isUnbuiltNote(line) {
  return /\bnot yet implemented\b/i.test(line);
}

function isHistoricalNote(line) {
  return /\b(was|were|is|are)\s+(removed|deleted|retired|replaced|dropped)\b/i.test(line)
    || /\bno longer\b/i.test(line)
    || /\bany ?more\b/i.test(line)
    || /\breplaces?\b/i.test(line)
    || /\bmerged into\b/i.test(line)
    || /\bused to\b/i.test(line)
    || /\bstale\b/i.test(line)
    || /\bhistorical\b/i.test(line)
    || line.trim().startsWith("--")   // SQL comment
    || /^\s*(#|\/\/)/.test(line);      // shell / js comment
}

/** A dependency named anywhere in the workspace's package.json files. */
function dependencyExists(name) {
  const files = ["package.json", ...workspaceDirs().map((d) => `${d}/package.json`)];
  for (const f of files) {
    const raw = read(f);
    if (!raw) continue;
    try {
      const j = JSON.parse(raw);
      for (const field of ["dependencies", "devDependencies"]) {
        if (j[field] && Object.keys(j[field]).some((d) => d === name || d.startsWith(`${name}/`))) {
          return true;
        }
      }
    } catch {
      /* unparseable package.json is someone else's check */
    }
  }
  return false;
}

// ── Check 1 — no instruction tells anyone to use a removed tool ─────────────
//
// Any tool listed here is checked against the workspace's real dependencies,
// so retiring the NEXT tool does not require remembering to add a check.
// Match USAGE, not the word — an instruction file should be free to say
// "X was removed at …"; what must not survive is anything an agent could
// FOLLOW: a command to run, a module to import, or an API call.
const RETIRED_TOOL_PATTERNS = [
  {
    tool: "prisma",
    re: /(?:npx\s+prisma\b|\bprisma\s+(?:generate|migrate|db|studio)\b|@prisma\/|from\s+["'`][^"'`]*\/prisma["'`]|\bprisma\.\w+\.\w+\(|\bPrismaClient\b)/i,
  },
];

for (const rel of instructionFiles()) {
  const text = read(rel);
  if (text === null) continue;
  for (const { tool, re } of RETIRED_TOOL_PATTERNS) {
    if (dependencyExists(tool)) continue; // still a real dependency — nothing to say
    text.split("\n").forEach((line, i) => {
      if (!re.test(line) || isHistoricalNote(line)) return;
      failures.push(
        `${rel}:${i + 1} mentions "${tool}", which is not a dependency of any package ` +
          `in this workspace. If this is a historical note, phrase it as one ` +
          `("… was removed at …"); if it is an instruction, it is wrong.\n      ${line.trim().slice(0, 120)}`,
      );
    });
  }
}
checked.push("no instruction references a tool that is not a real dependency");

// ── Check 2 — nothing claims CI runs while no workflow exists ───────────────
const hasWorkflows =
  existsSync(path.join(ROOT, ".github/workflows")) &&
  readdirSync(path.join(ROOT, ".github/workflows")).some((f) => /\.ya?ml$/.test(f));

if (!hasWorkflows) {
  const CI_CLAIM = /\bCI\s+(runs|will run|enforces|fails|checks)\b|\bfails\s+(a\s+)?(PR|CI)\b/i;
  for (const rel of instructionFiles()) {
    const text = read(rel);
    if (text === null) continue;
    text.split("\n").forEach((line, i) => {
      if (!CI_CLAIM.test(line) || isHistoricalNote(line)) return;
      if (/\bno CI\b/i.test(line)) return; // correctly says there is none
      failures.push(
        `${rel}:${i + 1} asserts CI does something, but .github/workflows/ has no ` +
          `workflow files. Either restore CI or state plainly that there is none.\n      ${line.trim().slice(0, 120)}`,
      );
    });
  }
} else {
  // Workflows existing is not the same as workflows triggering. The known
  // failure mode in this kit's ancestry: a fork works on a branch its ci.yml
  // never matches, and the instructions' "CI enforces X" quietly becomes
  // false while the file sits there looking healthy. Cheap local check: the
  // primary CI workflow's push trigger must cover the repo's default branch.
  try {
    const ciPath = path.join(ROOT, ".github/workflows/ci.yml");
    if (existsSync(ciPath)) {
      const ci = readFileSync(ciPath, "utf8");
      const pushBlock = ci.match(/on:\s*[\s\S]*?push:\s*\n\s*branches:\s*\[([^\]]*)\]/);
      if (pushBlock) {
        const branches = pushBlock[1].split(",").map((b) => b.trim().replace(/['"]/g, ""));
        let defaultBranch = "main";
        try {
          defaultBranch = execFileSync(
            "git",
            ["symbolic-ref", "--short", "refs/remotes/origin/HEAD"],
            { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
          ).trim().replace(/^origin\//, "");
        } catch {
          /* no origin/HEAD ref — keep the "main" assumption */
        }
        if (!branches.includes(defaultBranch) && !branches.includes("*")) {
          failures.push(
            `.github/workflows/ci.yml push trigger covers [${branches.join(", ")}] but the ` +
              `default branch is "${defaultBranch}" — CI will never run on it, and every ` +
              `instruction claiming CI enforcement is silently false. Update the trigger.`,
          );
        }
      }
    }
  } catch {
    /* unreadable ci.yml is caught by CI itself */
  }
}
checked.push("no instruction claims CI enforcement that does not exist or cannot trigger");

// ── Check 3 — every hook command in .claude/settings.json resolves ──────────
//
// A hook naming a script that has moved or been renamed fails silently at
// session start; nobody sees it, and the guarantee it was supposed to provide
// quietly disappears.
const settingsRaw = read(".claude/settings.json");
if (settingsRaw) {
  try {
    const settings = JSON.parse(settingsRaw);
    const commands = JSON.stringify(settings).match(/node\s+[^"\\]+\.mjs/g) ?? [];
    for (const cmd of commands) {
      const scriptPath = cmd.replace(/^node\s+/, "").trim();
      if (!existsSync(path.join(ROOT, scriptPath))) {
        failures.push(
          `.claude/settings.json wires a hook to "${scriptPath}", which does not exist.`,
        );
      }
    }
  } catch {
    failures.push(".claude/settings.json is not valid JSON.");
  }
}
checked.push("every hook script named in .claude/settings.json exists");

// ── Check 4 — package scripts named in instructions actually exist ──────────
//
// Catches the class of rot where an instruction tells someone to run a
// command that was renamed or never existed. Two unambiguous shapes only:
//   `pnpm --filter <pkg> run <script>`  — checked against that package
//   `pnpm run <script>` / `pnpm <script>` root invocations are NOT checked
//   (ambiguous between root and turbo passthrough — false-positive territory).
function packageScripts(dirRel) {
  const raw = read(`${dirRel}/package.json`);
  if (!raw) return null;
  try {
    const j = JSON.parse(raw);
    return { name: j.name, scripts: new Set(Object.keys(j.scripts ?? {})) };
  } catch {
    return null;
  }
}
const pkgIndex = new Map(); // filter name (pkg name OR dir basename) → scripts Set
for (const dir of workspaceDirs()) {
  const info = packageScripts(dir);
  if (!info) continue;
  pkgIndex.set(path.basename(dir), info.scripts);
  if (info.name) pkgIndex.set(info.name, info.scripts);
}

for (const rel of instructionFiles()) {
  const text = read(rel);
  if (text === null) continue;
  for (const m of text.matchAll(/`pnpm --filter ([@\w/-]+) run ([a-z][\w:-]*)`/g)) {
    const [, filter, script] = m;
    const set = pkgIndex.get(filter);
    if (!set) continue; // package not scaffolded yet — path rot is Check 5's job
    if (!set.has(script)) {
      failures.push(
        `${rel} references \`pnpm --filter ${filter} run ${script}\`, but that package ` +
          `has no "${script}" script.`,
      );
    }
  }
}
checked.push("package scripts named in instructions exist in the package they name");

// ── Check 5 — repo-root-relative paths named in instructions exist ─────────
//
// Scoped to paths starting apps/, packages/, scripts/, or .claude/ — only
// those are unambiguously repo-root-relative. Globs and `...` gestures are
// skipped — they are patterns, not paths. An illustrative filename in a
// naming convention or a table of examples is not a claim that the file
// exists.
//
// `scripts/` was added 2026-09-11. It had been omitted, and the omission was
// load-bearing: scripts/ is where every tripwire in this repo lives, so the
// one root directory the instruction-checker could not see was the directory
// holding the enforcement it exists to keep honest. Four tripwires —
// check-schema-prerequisites, check-driver-capability, check-audit-coverage,
// and feedback-check — were described in the present tense across skills,
// agent files, and a docs-site page while no such file existed, and this
// check passed green the whole time.
//
// Instruction prose names a script two ways, so both are matched:
//   - inline code:   `scripts/check-secrets.mjs`
//   - a command:     node scripts/check-secrets.mjs   (often inside a fence)
// Matching only the backticked form misses the more consequential case — a
// command block is something a reader is told to RUN, and a missing file
// there fails at the terminal rather than merely misinforming.
//
// Two tolerances keep this useful during phased scaffolding without letting
// real rot through:
//   1. A reference into a wholly-absent module (apps/<x>/…, packages/<x>/…,
//      or .claude/skills/<x>/… where the module root itself doesn't exist)
//      is a PLANNED module, not a dangling file — skipped. A dangling file
//      inside an EXISTING module still fails.
//   2. A git-ignored path (.claude/trivial-ok.json, .claude/pre-push-ok.json)
//      is runtime state that legitimately never exists in a fresh checkout.
const PATH_REF = /`((?:apps|packages|scripts|\.claude)\/[A-Za-z0-9._/-]+)`/g;

// A bare `node scripts/foo.mjs` invocation, backticked or not, fenced or not.
const CMD_REF = /\bnode\s+((?:scripts|apps|packages)\/[A-Za-z0-9._/-]+\.(?:mjs|js|ts))/g;

function isGitIgnored(rel) {
  try {
    execFileSync("git", ["check-ignore", "-q", rel], { cwd: ROOT });
    return true;
  } catch {
    return false;
  }
}

function isPlannedModuleRef(ref) {
  const m = /^(apps|packages)\/([^/]+)(\/|$)/.exec(ref) ??
    /^(\.claude\/skills)\/([^/]+)(\/|$)/.exec(ref);
  if (!m) return false;
  return !existsSync(path.join(ROOT, m[1], m[2]));
}

for (const rel of instructionFiles()) {
  const text = read(rel);
  if (text === null) continue;
  const seen = new Set();
  const refs = [...text.matchAll(PATH_REF), ...text.matchAll(CMD_REF)];
  for (const m of refs) {
    const ref = m[1];
    if (ref.includes("*") || ref.includes("...") || ref.endsWith("/")) continue;
    // Markdown wraps sentences, so the qualifier that makes a reference
    // historical ("… are retired") is often on the NEXT line, not the one
    // holding the path. Look at a one-line window either side.
    const lines = text.split("\n");
    const idx = lines.findIndex((l) => l.includes("`" + ref + "`") || l.includes("node " + ref));
    const line = idx === -1 ? "" : lines.slice(Math.max(0, idx - 1), idx + 2).join(" ");
    const isConventionRow =
      line.trimStart().startsWith("|") && /YYYY|<slug>|<app>|<name>|<type>|X\.Y/.test(line);
    if (/\bexample\b/i.test(line) || isConventionRow || isHistoricalNote(line) || isUnbuiltNote(line)) continue;
    if (seen.has(ref)) continue;
    seen.add(ref);
    if (isPlannedModuleRef(ref) || isGitIgnored(ref)) continue;
    if (!existsSync(path.join(ROOT, ref))) {
      failures.push(
        `${rel} references \`${ref}\`, which does not exist. An agent told to ` +
          `consult a missing file has no way to know it is missing.`,
      );
    }
  }
}
checked.push("repo-root-relative paths named in instructions exist");

// ── Report ─────────────────────────────────────────────────────────────────
if (failures.length === 0) {
  console.log(`[check-instructions] PASS — ${checked.length} checks:`);
  for (const c of checked) console.log(`  ✓ ${c}`);
  process.exit(0);
}

console.error(
  `[check-instructions] FAIL — ${failures.length} instruction(s) contradict the repo:\n`,
);
for (const f of failures) console.error(`  • ${f}`);
console.error(
  `\nInstructions are read by agents that cannot verify them. A stale one is\n` +
    `not a documentation problem — it is a wrong instruction that will be followed.\n`,
);
process.exit(1);
