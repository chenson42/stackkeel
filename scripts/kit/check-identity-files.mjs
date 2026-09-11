#!/usr/bin/env node
// check-identity-files: anti-rot tripwire for the personalize find-replace pass.
//
// scripts/kit/identity-files.json registers every file carrying the kit's
// identity. The personalize skill renames a fork by walking THAT registry, so
// an identity-bearing file that isn't registered survives personalization
// still calling itself "stackkeel". This tripwire fails (canonical repo only)
// when the kit name appears — in file content OR in a file path — outside the
// registry and the always-exempt trees, forcing the author of a new
// identity-bearing file to register it in the same change.
//
// In forks (kit-check ≠ CANONICAL-OK) this exits 0: post-personalization hits
// are the fork's own name choices, not kit rot.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { checkKit } from "./kit-check.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

const SKIP_DIRS = new Set(["node_modules", ".git", ".turbo", ".next", "dist", "coverage", "build", ".expo", "Pods", ".gradle"]);
const BINARY_EXT = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".icns", ".pdf", ".keystore", ".jar", ".ttf", ".otf", ".woff", ".woff2"]);

export function scan(root, registry) {
  const namePat = new RegExp(registry.kitNamePattern, "i");
  const registered = new Set(registry.files.map((f) => f.path));
  const exempt = registry.exemptPrefixes;
  const violations = [];

  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      if (SKIP_DIRS.has(entry)) continue;
      const abs = path.join(dir, entry);
      const rel = path.relative(root, abs);
      if (exempt.some((p) => rel.startsWith(p)) || rel === "pnpm-lock.yaml") continue;
      const st = statSync(abs);
      if (st.isDirectory()) {
        walk(abs);
        continue;
      }
      if (registered.has(rel)) continue;
      const pathHit = namePat.test(rel);
      let contentHit = false;
      if (!BINARY_EXT.has(path.extname(entry).toLowerCase()) && st.size < 2_000_000) {
        try {
          contentHit = namePat.test(readFileSync(abs, "utf8"));
        } catch {
          /* unreadable — ignore */
        }
      }
      if (pathHit || contentHit) {
        violations.push({ file: rel, where: pathHit ? "path" : "content" });
      }
    }
  };
  walk(root);
  return violations;
}

const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  const state = checkKit().state;
  if (state !== "CANONICAL-OK" && !process.env.KIT_IDENTITY_CHECK_FORCE) {
    console.log(`[check-identity-files] skipped (kit state: ${state} — canonical-repo tripwire only)`);
    process.exit(0);
  }
  const registry = JSON.parse(
    readFileSync(path.join(repoRoot, "scripts/kit/identity-files.json"), "utf8"),
  );
  const violations = scan(repoRoot, registry);
  if (violations.length === 0) {
    console.log("[check-identity-files] PASS — every kit-name occurrence is registered.");
    process.exit(0);
  }
  console.log(`[check-identity-files] FAIL — ${violations.length} unregistered identity-bearing file(s):\n`);
  for (const v of violations) console.log(`  • ${v.file}  (${v.where} hit)`);
  console.log(
    "\nRegister each in scripts/kit/identity-files.json (with a `note` naming the\n" +
      "identity-bearing content) or remove the kit name from the file. An unregistered\n" +
      "hit survives personalization and ships a fork that still calls itself the kit.",
  );
  process.exit(1);
}
