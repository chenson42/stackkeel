// Fixture-based tests for check-audit-coverage.mjs. The script derives ROOT
// from its own location, so (same pattern as check-instructions.test.mjs) each
// case copies it into a throwaway tree and asserts real exit codes.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, cpSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), "check-audit-coverage.mjs");

function run(actionSource) {
  const root = mkdtempSync(path.join(tmpdir(), "audit-cov-"));
  try {
    mkdirSync(path.join(root, "scripts"), { recursive: true });
    cpSync(SCRIPT, path.join(root, "scripts", "check-audit-coverage.mjs"));
    const dir = path.join(root, "apps", "portal", "src", "app", "(member)", "thing");
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, "actions.ts"), actionSource);
    try {
      execFileSync("node", [path.join(root, "scripts", "check-audit-coverage.mjs")], {
        encoding: "utf8",
      });
      return 0;
    } catch (err) {
      return err.status ?? 1;
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("unaudited mutation fails", () => {
  assert.equal(run(`"use server";\nexport async function doThing() {\n  await db.insert(things).values({});\n}\n`), 1);
});

test("audited mutation passes", () => {
  assert.equal(
    run(`"use server";\nexport async function doThing() {\n  await db.insert(things).values({});\n  await recordAudit({ action: "thing.done" });\n}\n`),
    0,
  );
});

test("audit-exempt comment on the line above passes", () => {
  assert.equal(
    run(`"use server";\nexport async function doThing() {\n  // audit-exempt: idempotent self-serve toggle, no security surface\n  await db.update(things).set({});\n}\n`),
    0,
  );
});

test("exempting one mutation does not cover a second unexempted one", () => {
  assert.equal(
    run(
      `"use server";\nexport async function a() {\n  // audit-exempt: reason\n  await db.update(things).set({});\n}\nexport async function b() {\n  await db.delete(things);\n}\n`,
    ),
    1,
  );
});

test("read-only action file passes", () => {
  assert.equal(run(`"use server";\nexport async function list() {\n  return db.select().from(things);\n}\n`), 0);
});
