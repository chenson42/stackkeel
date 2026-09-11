import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { planStrip, stripFences, stripEnvLines, loadRegistry } from "./strip-module.mjs";

const registry = loadRegistry();

describe("planStrip", () => {
  test("unknown module throws with the known list", () => {
    assert.throws(() => planStrip(registry, "nope"), /unknown module "nope"/);
  });

  test("helpdesk plan deletes its paths, migration, fences, and records removal", () => {
    const actions = planStrip(registry, "helpdesk");
    const deletes = actions.filter((a) => a.type === "delete-path").map((a) => a.path);
    assert.ok(deletes.includes("apps/portal/src/app/(member)/support/"));
    assert.ok(deletes.includes("packages/db/migrations/0006_helpdesk.sql"));
    assert.ok(actions.some((a) => a.type === "remove-fences" && a.file === "packages/db/src/index.ts"));
    const rec = actions.find((a) => a.type === "record-removed");
    assert.equal(rec.module, "helpdesk");
    assert.ok(rec.paths.length > 0);
  });

  test("keep-dormant modules delete nothing", () => {
    for (const name of ["twoFactor", "oidc"]) {
      const actions = planStrip(registry, name);
      assert.equal(actions.filter((a) => a.type === "delete-path").length, 0, name);
      assert.ok(actions.some((a) => a.type === "record-removed"));
    }
  });

  test("already-absent paths become notes, not deletes", () => {
    const actions = planStrip(registry, "mobile", { exists: () => false });
    assert.equal(actions.filter((a) => a.type === "delete-path").length, 0);
    assert.ok(actions.some((a) => a.type === "note" && /already absent/.test(a.message)));
  });

  test("every registry module yields a plan ending in record-removed", () => {
    for (const name of Object.keys(registry.modules)) {
      const actions = planStrip(registry, name);
      assert.equal(actions.at(-1).type, "record-removed", name);
    }
  });

  test("device-auth is an auto module triggered by shell+mobile", () => {
    assert.deepEqual(registry.modules["device-auth"].auto.whenAllStripped, ["shell", "mobile"]);
  });
});

describe("stripFences", () => {
  const src = [
    "keep-1",
    "// kit-module:helpdesk-begin",
    "gone-1",
    "gone-2",
    "// kit-module:helpdesk-end",
    "keep-2",
    "# kit-module:other-begin",
    "other-kept",
    "# kit-module:other-end",
  ].join("\n");

  test("removes only the named module's fenced block, fence lines included", () => {
    const out = stripFences(src, "helpdesk");
    assert.ok(!out.includes("gone-1") && !out.includes("gone-2"));
    assert.ok(!out.includes("kit-module:helpdesk"));
    assert.ok(out.includes("keep-1") && out.includes("keep-2"));
    assert.ok(out.includes("other-kept") && out.includes("kit-module:other-begin"));
  });

  test("multiple blocks for the same module are all removed", () => {
    const two = `${src}\n// kit-module:helpdesk-begin\ngone-3\n// kit-module:helpdesk-end\n`;
    const out = stripFences(two, "helpdesk");
    assert.ok(!out.includes("gone-3"));
  });
});

describe("stripEnvLines", () => {
  test("removes set and commented forms, keeps everything else", () => {
    const env = "A=1\n# NEXT_PUBLIC_ADMIN_URL=http://x\nNEXT_PUBLIC_ADMIN_URL=y\nB=2";
    const out = stripEnvLines(env, ["NEXT_PUBLIC_ADMIN_URL"]);
    assert.equal(out, "A=1\nB=2");
  });
});
