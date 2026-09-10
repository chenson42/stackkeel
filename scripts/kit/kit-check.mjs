#!/usr/bin/env node
// kit-check: is this working copy the canonical kit, a personalized fork, or an
// unpersonalized starter copy that should run /personalize?
//
// Exit codes: always 0, except --strict which exits 1 on UNPERSONALIZED (and
// not declined). Invalid kit.json warns and exits 0 — this script must never
// brick a repo.
//
// Consumers: Claude SessionStart hook (--banner), personalize-gate.mjs (imports
// checkKit), `pnpm kit:check` / `predev`, and CI (--strict).

import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function readJson(file) {
  return JSON.parse(readFileSync(path.join(repoRoot, file), "utf8"));
}

// git@github.com:o/r.git, https://github.com/o/r.git, https://github.com/o/r/
// all normalize to https://github.com/o/r (lowercased).
export function normalizeRemote(url) {
  if (!url) return null;
  let u = url.trim();
  const ssh = u.match(/^git@([^:]+):(.+)$/);
  if (ssh) u = `https://${ssh[1]}/${ssh[2]}`;
  u = u.replace(/\.git$/, "").replace(/\/+$/, "");
  return u.toLowerCase();
}

function gitOriginUrl() {
  // CI checkouts have unreliable remotes; GITHUB_REPOSITORY is authoritative there.
  if (process.env.GITHUB_REPOSITORY) {
    return `https://github.com/${process.env.GITHUB_REPOSITORY}`;
  }
  try {
    return execFileSync("git", ["remote", "get-url", "origin"], {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null; // no remote at all — a plain copied directory
  }
}

/**
 * @returns {{state: "PERSONALIZED-OK"|"CANONICAL-OK"|"DECLINED"|"UNPERSONALIZED"|"INVALID", warnings: string[], manifest: object|null}}
 */
export function checkKit() {
  const warnings = [];
  let manifest;
  try {
    manifest = readJson("kit.json");
  } catch (err) {
    return { state: "INVALID", warnings: [`kit.json unreadable: ${err.message}`], manifest: null };
  }
  for (const key of ["kit", "identity", "modules", "paths", "sync"]) {
    if (typeof manifest[key] !== "object" || manifest[key] === null) {
      return { state: "INVALID", warnings: [`kit.json missing required section "${key}"`], manifest };
    }
  }

  // Secondary consistency check: a half-done manual personalization leaves the
  // package name and the manifest disagreeing.
  try {
    const pkg = readJson("package.json");
    const expected = manifest.identity.personalized ? manifest.identity.slug : manifest.kit.name;
    if (expected && pkg.name !== expected) {
      warnings.push(
        `package.json name "${pkg.name}" does not match kit.json ("${expected}") — personalization may be incomplete`
      );
    }
  } catch {
    warnings.push("package.json unreadable");
  }

  if (manifest.identity.personalized === true) {
    return { state: "PERSONALIZED-OK", warnings, manifest };
  }

  const origin = normalizeRemote(gitOriginUrl());
  const canonical = normalizeRemote(manifest.kit.canonicalUrl);
  if (origin && canonical && origin === canonical) {
    return { state: "CANONICAL-OK", warnings, manifest };
  }

  if (manifest.identity.personalizationDeclined === true) {
    return { state: "DECLINED", warnings, manifest };
  }
  return { state: "UNPERSONALIZED", warnings, manifest };
}

function printBanner(result) {
  const name = result.manifest?.kit?.name ?? "the starter kit";
  console.log("");
  console.log("┌──────────────────────────────────────────────────────────────────────┐");
  console.log("│  UNPERSONALIZED STARTER COPY DETECTED                                │");
  console.log("└──────────────────────────────────────────────────────────────────────┘");
  console.log(`This repository still identifies as "${name}" but its git origin is not`);
  console.log("the canonical kit repository. Before doing any work here:");
  console.log("");
  console.log("  • With an AI assistant: run the personalize skill (/personalize —");
  console.log("    defined in .claude/skills/personalize/SKILL.md, readable by any");
  console.log("    Agent Skills-compatible tool).");
  console.log("  • To opt out deliberately: set identity.personalizationDeclined=true");
  console.log("    in kit.json.");
  console.log("");
  console.log("Details: pnpm kit:check --why");
  console.log("");
}

const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  const args = new Set(process.argv.slice(2));
  const result = checkKit();

  for (const w of result.warnings) console.log(`KIT-CHECK warning: ${w}`);

  switch (result.state) {
    case "INVALID":
      console.log("KIT-CHECK: kit.json invalid — fix it or restore from the kit.");
      break;
    case "PERSONALIZED-OK":
      if (args.has("--why")) console.log("KIT-CHECK: personalized fork — all good.");
      break;
    case "CANONICAL-OK":
      if (args.has("--why")) console.log("KIT-CHECK: canonical kit repository — personalization not applicable.");
      break;
    case "DECLINED":
      console.log("KIT-CHECK: unpersonalized copy (personalization explicitly declined).");
      break;
    case "UNPERSONALIZED":
      if (args.has("--banner") || args.has("--why")) printBanner(result);
      else console.log("KIT-CHECK: UNPERSONALIZED starter copy — run /personalize (details: pnpm kit:check --why)");
      if (args.has("--strict")) process.exit(1);
      break;
  }
  process.exit(0);
}
