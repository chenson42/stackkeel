/**
 * Unit tests for the work-log gate's pure decision logic. The git/fs glue
 * (collectWorklogs, --pre-commit staging reads, marker consumption) is
 * integration territory; these tests pin the decision engine and the
 * monorepo trigger classification.
 *
 * Run via: node --test scripts/
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isTriggerPath,
  extractPhaseSection,
  worklogMentionsPath,
  hasNotVerifiedHeading,
  isPhaseSectionSubstantive,
  trivialMarkerMatches,
  evaluateWorklogGate,
} from "./worklog-gate.mjs";

describe("isTriggerPath (monorepo classification)", () => {
  it("app source triggers", () => {
    assert.equal(isTriggerPath("apps/portal/src/app/page.tsx"), true);
    assert.equal(isTriggerPath("apps/admin/src/lib/foo.ts"), true);
  });

  it("expo app dir triggers", () => {
    assert.equal(isTriggerPath("apps/mobile/app/index.tsx"), true);
  });

  it("app drizzle triggers", () => {
    assert.equal(isTriggerPath("apps/portal/drizzle/0001_x.sql"), true);
  });

  it("package source and migrations trigger", () => {
    assert.equal(isTriggerPath("packages/db/src/schema/identity.ts"), true);
    assert.equal(isTriggerPath("packages/db/migrations/0001_init.sql"), true);
  });

  it("process tooling is exempt", () => {
    assert.equal(isTriggerPath("scripts/worklog-gate.mjs"), false);
    assert.equal(isTriggerPath(".claude/skills/personalize/SKILL.md"), false);
    assert.equal(isTriggerPath("docs/work-log/2026-09-10-x.md"), false);
    assert.equal(isTriggerPath("kit.json"), false);
  });

  it("app config files are exempt", () => {
    assert.equal(isTriggerPath("apps/portal/package.json"), false);
    assert.equal(isTriggerPath("apps/portal/next.config.ts"), false);
    assert.equal(isTriggerPath("packages/db/package.json"), false);
  });
});

describe("extractPhaseSection", () => {
  const doc = [
    "# Phase 1 — Refinement",
    "phase one text",
    "# Phase 4 — Implementation",
    "phase four text",
    "## What was NOT verified",
    "nothing",
    "# Phase 5 — Test Verification",
    "phase five text",
  ].join("\n");

  it("extracts a middle section", () => {
    const s = extractPhaseSection(doc, 4);
    assert.match(s, /phase four text/);
    assert.match(s, /What was NOT verified/);
    assert.doesNotMatch(s, /phase five text/);
  });

  it("extracts the final section to EOF", () => {
    const s = extractPhaseSection(doc, 5);
    assert.match(s, /phase five text/);
  });

  it("returns null for a missing phase", () => {
    assert.equal(extractPhaseSection(doc, 3), null);
  });
});

describe("phase-section predicates", () => {
  it("placeholder Phase 4 is not substantive", () => {
    assert.equal(
      isPhaseSectionSubstantive("stuff\n`path/to/file` — purpose\n", 4),
      false,
    );
  });

  it("filled Phase 4 is substantive", () => {
    assert.equal(isPhaseSectionSubstantive("edited src/foo.ts to do X", 4), true);
  });

  it("null section is not substantive", () => {
    assert.equal(isPhaseSectionSubstantive(null, 4), false);
  });

  it("heading detector", () => {
    assert.equal(hasNotVerifiedHeading("## What was NOT verified\n- x"), true);
    assert.equal(hasNotVerifiedHeading("no heading here"), false);
  });
});

describe("trivialMarkerMatches", () => {
  const now = "2026-09-10T12:00:00.000Z";

  it("matches path within expiry", () => {
    const marker = { path: "apps/portal/src/x.ts", expiresAt: "2026-09-10T13:00:00Z" };
    assert.equal(trivialMarkerMatches(marker, "apps/portal/src/x.ts", now), true);
  });

  it("rejects a different path", () => {
    const marker = { path: "apps/portal/src/x.ts", expiresAt: "2026-09-10T13:00:00Z" };
    assert.equal(trivialMarkerMatches(marker, "apps/portal/src/y.ts", now), false);
  });

  it("rejects expired and malformed markers", () => {
    const expired = { path: "apps/portal/src/x.ts", expiresAt: "2026-09-10T11:00:00Z" };
    assert.equal(trivialMarkerMatches(expired, "apps/portal/src/x.ts", now), false);
    assert.equal(trivialMarkerMatches(null, "apps/portal/src/x.ts", now), false);
    assert.equal(
      trivialMarkerMatches({ path: "apps/portal/src/x.ts" }, "apps/portal/src/x.ts", now),
      false,
    );
  });
});

describe("evaluateWorklogGate", () => {
  const target = "apps/portal/src/app/page.tsx";
  const freshNever = () => false;

  it("allows non-trigger paths without touching worklogs", () => {
    const r = evaluateWorklogGate({
      targetPath: "docs/decisions.md",
      worklogDocsExists: true,
      worklogs: [],
      isFresh: freshNever,
      trivialExempt: false,
    });
    assert.equal(r.decision, "allow");
  });

  it("allows when docs/work-log/ does not exist (stripped fork)", () => {
    const r = evaluateWorklogGate({
      targetPath: target,
      worklogDocsExists: false,
      worklogs: [],
      isFresh: freshNever,
      trivialExempt: false,
    });
    assert.equal(r.decision, "allow");
  });

  it("allows on trivial exemption", () => {
    const r = evaluateWorklogGate({
      targetPath: target,
      worklogDocsExists: true,
      worklogs: [],
      isFresh: freshNever,
      trivialExempt: true,
    });
    assert.equal(r.decision, "allow");
  });

  it("blocks a trigger edit with no qualifying work-log", () => {
    const r = evaluateWorklogGate({
      targetPath: target,
      worklogDocsExists: true,
      worklogs: [{ path: "docs/work-log/2026-09-01-other.md", content: "unrelated" }],
      isFresh: freshNever,
      trivialExempt: false,
    });
    assert.equal(r.decision, "block");
    assert.match(r.reason, /no code before the work-log/);
  });

  it("allows when a work-log mentions the path", () => {
    const r = evaluateWorklogGate({
      targetPath: target,
      worklogDocsExists: true,
      worklogs: [
        { path: "docs/work-log/2026-09-10-portal-home.md", content: `Surface: ${target}` },
      ],
      isFresh: freshNever,
      trivialExempt: false,
    });
    assert.equal(r.decision, "allow");
  });

  it("allows when a work-log is fresh even without a mention", () => {
    const r = evaluateWorklogGate({
      targetPath: target,
      worklogDocsExists: true,
      worklogs: [{ path: "docs/work-log/2026-09-10-portal-home.md", content: "wip" }],
      isFresh: () => true,
      trivialExempt: false,
    });
    assert.equal(r.decision, "allow");
  });

  it("blocks when the only qualifying work-log has a substantive Phase 4 without the NOT-verified heading", () => {
    const content = [
      `Surface: ${target}`,
      "# Phase 4 — Implementation",
      "did real work on the page",
    ].join("\n");
    const r = evaluateWorklogGate({
      targetPath: target,
      worklogDocsExists: true,
      worklogs: [{ path: "docs/work-log/2026-09-10-portal-home.md", content }],
      isFresh: freshNever,
      trivialExempt: false,
    });
    assert.equal(r.decision, "block");
    assert.match(r.reason, /What was NOT verified/);
  });

  it("allows when the substantive Phase 4 carries the heading", () => {
    const content = [
      `Surface: ${target}`,
      "# Phase 4 — Implementation",
      "did real work on the page",
      "## What was NOT verified",
      "- e2e still pending",
    ].join("\n");
    const r = evaluateWorklogGate({
      targetPath: target,
      worklogDocsExists: true,
      worklogs: [{ path: "docs/work-log/2026-09-10-portal-home.md", content }],
      isFresh: freshNever,
      trivialExempt: false,
    });
    assert.equal(r.decision, "allow");
  });

  it("any one fully-qualifying work-log is sufficient", () => {
    const bad = {
      path: "docs/work-log/2026-09-10-bad.md",
      content: `Surface: ${target}\n# Phase 4 — Implementation\nreal work, no heading`,
    };
    const good = {
      path: "docs/work-log/2026-09-10-good.md",
      content: `Surface: ${target}\n# Phase 4 — Implementation\nreal work\n## What was NOT verified\n- x`,
    };
    const r = evaluateWorklogGate({
      targetPath: target,
      worklogDocsExists: true,
      worklogs: [bad, good],
      isFresh: freshNever,
      trivialExempt: false,
    });
    assert.equal(r.decision, "allow");
  });
});

describe("worklogMentionsPath", () => {
  it("substring semantics", () => {
    assert.equal(worklogMentionsPath("see apps/portal/src/x.ts here", "apps/portal/src/x.ts"), true);
    assert.equal(worklogMentionsPath("nothing", "apps/portal/src/x.ts"), false);
  });
});
