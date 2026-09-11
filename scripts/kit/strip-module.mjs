#!/usr/bin/env node
// strip-module: remove an optional module per scripts/kit/module-registry.json.
//
//   pnpm kit:strip -- <module> [--dry-run]
//
// Planning is pure (planStrip: registry entry + repo state → action list) and
// unit-tested; execution applies the plan. --dry-run prints the plan and
// touches nothing. After a real strip this runs `pnpm install` (lockfile
// prune) and reports; it deliberately does NOT run the full build — the
// personalize skill owns verify-or-rollback:
//   pnpm turbo typecheck build   # verify
//   git checkout -- . && git clean -fd <paths>   # rollback if it fails
//
// Fences: a `kit-module:<name>-begin` … `kit-module:<name>-end` comment pair
// (any comment syntax) marks a block strip removes, fence lines included.

import { readFileSync, writeFileSync, rmSync, existsSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

export function loadRegistry(root = repoRoot) {
  return JSON.parse(readFileSync(path.join(root, "scripts/kit/module-registry.json"), "utf8"));
}

/**
 * Pure planner: returns the ordered action list for stripping `name`.
 * Each action: {type, ...}. Types:
 *   delete-path {path} · remove-fences {file} · replace {file, find, replaceWith}
 *   remove-env-lines {file, vars} · prune-workspace-glob {glob}
 *   note {message} · record-removed {module, paths}
 */
export function planStrip(registry, name, { exists = () => true } = {}) {
  const mod = registry.modules[name];
  if (!mod) {
    const known = Object.keys(registry.modules).join(", ");
    throw new Error(`unknown module "${name}" — known: ${known}`);
  }
  const actions = [];
  const strategy = mod.strategy ?? "file-strip";

  if (strategy === "keep-dormant") {
    for (const w of mod.warnings ?? []) actions.push({ type: "note", message: w });
    if ((mod.envVars ?? []).length) {
      actions.push({ type: "remove-env-lines", file: ".env.example", vars: mod.envVars });
    }
    actions.push({ type: "record-removed", module: name, paths: [] });
    return actions;
  }

  for (const p of [...(mod.paths ?? []), ...(mod.extraDeletePaths ?? []), ...(mod.migrations ?? [])]) {
    if (exists(p)) actions.push({ type: "delete-path", path: p });
    else actions.push({ type: "note", message: `already absent, skipping: ${p}` });
  }
  for (const f of mod.fencedFiles ?? []) {
    if (exists(f)) actions.push({ type: "remove-fences", file: f, module: name });
  }
  for (const r of mod.replacements ?? []) {
    if (exists(r.file)) actions.push({ type: "replace", file: r.file, find: r.find, replaceWith: r.replaceWith });
  }
  if ((mod.envVars ?? []).length) {
    actions.push({ type: "remove-env-lines", file: ".env.example", vars: mod.envVars });
  }
  for (const g of mod.workspaceGlobRemovals ?? []) {
    actions.push({ type: "prune-workspace-glob", glob: g });
  }
  for (const w of mod.warnings ?? []) actions.push({ type: "note", message: w });
  for (const s of mod.seamsPending ?? []) actions.push({ type: "note", message: `SEAM PENDING: ${s}` });
  actions.push({
    type: "record-removed",
    module: name,
    paths: [...(mod.paths ?? []), ...(mod.migrations ?? [])],
  });
  return actions;
}

/** Remove every kit-module:<name> fenced block (fence lines inclusive). */
export function stripFences(source, name) {
  const lines = source.split("\n");
  const out = [];
  let depth = 0;
  const begin = `kit-module:${name}-begin`;
  const end = `kit-module:${name}-end`;
  for (const line of lines) {
    if (line.includes(begin)) { depth += 1; continue; }
    if (line.includes(end)) { depth = Math.max(0, depth - 1); continue; }
    if (depth === 0) out.push(line);
  }
  return out.join("\n");
}

/** Remove env-inventory lines (set or commented-out) for the named vars. */
export function stripEnvLines(source, vars) {
  const res = vars.map((v) => new RegExp(`^#?\\s*${v}=`));
  return source
    .split("\n")
    .filter((line) => !res.some((re) => re.test(line)))
    .join("\n");
}

function execute(actions, { dryRun }) {
  const today = new Date().toISOString().slice(0, 10);
  for (const a of actions) {
    switch (a.type) {
      case "note":
        console.log(`  • ${a.message}`);
        break;
      case "delete-path": {
        console.log(`  ✂ delete ${a.path}`);
        if (!dryRun) rmSync(path.join(repoRoot, a.path), { recursive: true, force: true });
        break;
      }
      case "remove-fences": {
        console.log(`  ✂ unfence [${a.module}] ${a.file}`);
        if (!dryRun) {
          const f = path.join(repoRoot, a.file);
          writeFileSync(f, stripFences(readFileSync(f, "utf8"), a.module));
        }
        break;
      }
      case "replace": {
        console.log(`  ✂ replace block in ${a.file}`);
        if (!dryRun) {
          const f = path.join(repoRoot, a.file);
          const src = readFileSync(f, "utf8");
          if (!src.includes(a.find)) {
            console.log(`    ! find-target not present (already stripped or drifted) — skipped`);
          } else {
            writeFileSync(f, src.replace(a.find, a.replaceWith));
          }
        }
        break;
      }
      case "remove-env-lines": {
        console.log(`  ✂ drop env lines ${a.vars.join(", ")} from ${a.file}`);
        if (!dryRun) {
          const f = path.join(repoRoot, a.file);
          if (existsSync(f)) writeFileSync(f, stripEnvLines(readFileSync(f, "utf8"), a.vars));
        }
        break;
      }
      case "prune-workspace-glob": {
        console.log(`  ✂ remove "${a.glob}" from pnpm-workspace.yaml`);
        if (!dryRun) {
          const f = path.join(repoRoot, "pnpm-workspace.yaml");
          const pruned = readFileSync(f, "utf8")
            .split("\n")
            .filter((l) => !new RegExp(`^\\s*-\\s*"?${a.glob}"?\\s*$`).test(l))
            .join("\n");
          writeFileSync(f, pruned);
        }
        break;
      }
      case "record-removed": {
        console.log(`  ✎ kit.json paths.removed += ${a.module}`);
        if (!dryRun) {
          const f = path.join(repoRoot, "kit.json");
          const kit = JSON.parse(readFileSync(f, "utf8"));
          kit.paths.removed = (kit.paths.removed ?? []).filter((r) => r.module !== a.module);
          kit.paths.removed.push({ module: a.module, paths: a.paths, removedAt: today });
          writeFileSync(f, JSON.stringify(kit, null, 2) + "\n");
        }
        break;
      }
    }
  }
}

const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  const args = process.argv.slice(2).filter((a) => a !== "--");
  const dryRun = args.includes("--dry-run");
  const names = args.filter((a) => !a.startsWith("--"));
  if (names.length === 0) {
    const registry = loadRegistry();
    console.log("usage: pnpm kit:strip -- <module> [--dry-run]");
    console.log(`modules: ${Object.keys(registry.modules).join(", ")}`);
    process.exit(1);
  }
  const registry = loadRegistry();
  const exists = (p) => existsSync(path.join(repoRoot, p));

  for (const name of names) {
    console.log(`${dryRun ? "[dry-run] " : ""}strip ${name}:`);
    execute(planStrip(registry, name, { exists }), { dryRun });
  }

  // Auto modules: strip when every trigger module is now recorded removed.
  if (!dryRun) {
    const kit = JSON.parse(readFileSync(path.join(repoRoot, "kit.json"), "utf8"));
    const removed = new Set((kit.paths.removed ?? []).map((r) => r.module));
    for (const [autoName, mod] of Object.entries(registry.modules)) {
      const trigger = mod.auto?.whenAllStripped;
      if (!trigger || removed.has(autoName)) continue;
      if (trigger.every((t) => removed.has(t))) {
        console.log(`auto-strip ${autoName} (all of ${trigger.join("+")} are stripped):`);
        execute(planStrip(registry, autoName, { exists }), { dryRun });
      }
    }
    console.log("running pnpm install to prune the lockfile…");
    try {
      execFileSync("pnpm", ["install"], { cwd: repoRoot, stdio: "inherit" });
    } catch {
      console.log("pnpm install reported errors — inspect before proceeding.");
    }
    console.log(
      "\nNext: pnpm turbo typecheck build   (verify)\n" +
        "Rollback: git checkout -- . && git clean -fd <deleted paths>",
    );
  }
}
