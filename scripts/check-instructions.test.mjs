/**
 * Tests for check-instructions' Check 5 (repo-root-relative paths named in
 * instructions exist), specifically its `scripts/` scoping.
 *
 * Why a fixture rather than unit tests: check-instructions.mjs is a top-level
 * script with no exports, and it derives ROOT from its own location
 * (`path.dirname(import.meta.url)/..`). So the cheapest honest test is to copy
 * it into a throwaway repo, build instruction files around it, and assert on
 * the real exit code. That also exercises the regexes and the adjacency window
 * together, which is where this check's bugs actually live — the `scripts/`
 * omission this file was added alongside was invisible to every one of its
 * five green checkmarks.
 *
 * Run via: node --test scripts/
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
let fixture;

/** Build a throwaway repo containing the real checker and one instruction file. */
function makeFixture() {
  const root = mkdtempSync(path.join(tmpdir(), "check-instructions-"));
  mkdirSync(path.join(root, "scripts"));
  mkdirSync(path.join(root, ".claude", "skills", "demo"), { recursive: true });
  copyFileSync(
    path.join(HERE, "check-instructions.mjs"),
    path.join(root, "scripts", "check-instructions.mjs"),
  );
  // A script that really exists, so "present" cases have something to point at.
  writeFileSync(path.join(root, "scripts", "real-thing.mjs"), "// present\n");
  writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "fixture" }));
  return root;
}

/** Write the fixture's single instruction file and run the checker over it. */
function runWith(skillBody) {
  writeFileSync(
    path.join(fixture, ".claude", "skills", "demo", "SKILL.md"),
    `---\nname: demo\ndescription: fixture\n---\n\n# Demo\n\n${skillBody}\n`,
  );
  const r = spawnSync(process.execPath, [path.join(fixture, "scripts", "check-instructions.mjs")], {
    encoding: "utf8",
  });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
}

before(() => {
  fixture = makeFixture();
});
after(() => {
  if (fixture) rmSync(fixture, { recursive: true, force: true });
});

describe("Check 5 — scripts/ paths in instruction prose", () => {
  it("fails on a backticked scripts/ path that does not exist", () => {
    const { code, out } = runWith("Run `scripts/ghost.mjs` before pushing.");
    assert.equal(code, 1);
    assert.match(out, /scripts\/ghost\.mjs/);
  });

  it("fails on a bare `node scripts/…` command, including inside a fence", () => {
    const { code, out } = runWith("```bash\nnode scripts/ghost.mjs\n```");
    assert.equal(
      code,
      1,
      "a command block is something a reader is told to RUN — a missing file there " +
        "fails at the terminal, so it matters more than a prose mention, not less",
    );
    assert.match(out, /scripts\/ghost\.mjs/);
  });

  it("passes when the scripts/ path exists", () => {
    const { code } = runWith("Run `scripts/real-thing.mjs` before pushing.");
    assert.equal(code, 0);
  });

  it("passes when the line says the script is not yet implemented", () => {
    const { code } = runWith(
      "`scripts/ghost.mjs` is not yet implemented — the design below is settled.",
    );
    assert.equal(code, 0);
  });

  it("does NOT accept a vaguer marker as an escape hatch", () => {
    // "planned"/"TODO"/"coming soon" are deliberately not honoured: a loose
    // marker becomes the default within a week and the reader can no longer
    // tell what is real.
    for (const marker of ["is planned", "TODO", "coming soon"]) {
      const { code } = runWith(`\`scripts/ghost.mjs\` ${marker}.`);
      assert.equal(code, 1, `"${marker}" must not silence a dangling reference`);
    }
  });

  it("still ignores an explicitly historical reference", () => {
    const { code } = runWith("`scripts/ghost.mjs` was removed in favour of the new gate.");
    assert.equal(code, 0);
  });
});
