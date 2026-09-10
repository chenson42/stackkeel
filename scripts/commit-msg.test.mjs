/**
 * Unit tests for the commit-message validator.
 * Tests exercise validateCommitMessage() directly — not the file-reading hook
 * wrapper. Run via: node --test scripts/
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { validateCommitMessage } from "./commit-msg.mjs";

describe("validateCommitMessage", () => {
  // ── Passing cases ──────────────────────────────────────────────────────────

  it("valid feat with Work-Log trailer", () => {
    const msg = "feat: add CSV export\n\nWork-Log: 2026-09-10-csv-export";
    assert.equal(validateCommitMessage(msg).ok, true);
  });

  it("valid fix with all trailers", () => {
    const msg =
      "fix: reject bad Caught-By\n\nCaught-By: automated-test\nDiscovered-In: Phase-5\nWork-Log: 2026-09-10-csv-export";
    assert.equal(validateCommitMessage(msg).ok, true);
  });

  it("optional scope", () => {
    const msg = "feat(admin): add flag toggle\n\nWork-Log: 2026-09-10-flag-toggle";
    assert.equal(validateCommitMessage(msg).ok, true);
  });

  it("chore passes without Work-Log (optional outside feat/fix)", () => {
    assert.equal(validateCommitMessage("chore: bump deps").ok, true);
  });

  it("docs passes with a valid optional Work-Log", () => {
    const msg = "docs: update README\n\nWork-Log: 2026-09-10-readme-pass";
    assert.equal(validateCommitMessage(msg).ok, true);
  });

  it("Merge exemption", () => {
    assert.equal(validateCommitMessage("Merge branch 'main' into feature/x").ok, true);
  });

  it("Revert exemption", () => {
    assert.equal(validateCommitMessage('Revert "feat: add CSV export"').ok, true);
  });

  it("Release exemption", () => {
    assert.equal(validateCommitMessage("Release v0.4.0").ok, true);
  });

  // ── Failing cases ──────────────────────────────────────────────────────────

  it("missing prefix", () => {
    const result = validateCommitMessage("add CSV export");
    assert.equal(result.ok, false);
    assert.match(result.error, /must match/);
  });

  it("invalid prefix", () => {
    const result = validateCommitMessage("bugfix: something");
    assert.equal(result.ok, false);
    assert.match(result.error, /must match/);
  });

  it("description too long", () => {
    const result = validateCommitMessage("feat: " + "a".repeat(101));
    assert.equal(result.ok, false);
    assert.match(result.error, /must match/);
  });

  it("feat missing Work-Log", () => {
    const result = validateCommitMessage("feat: add CSV export");
    assert.equal(result.ok, false);
    assert.match(result.error, /feat commits require a "Work-Log/);
  });

  it("fix missing Work-Log (other trailers present)", () => {
    const msg = "fix: something\n\nCaught-By: automated-test\nDiscovered-In: Phase-5";
    const result = validateCommitMessage(msg);
    assert.equal(result.ok, false);
    assert.match(result.error, /fix commits require a "Work-Log/);
  });

  it("malformed Work-Log slug fails on any prefix", () => {
    const msg = "docs: update README\n\nWork-Log: EnforcementBatch";
    const result = validateCommitMessage(msg);
    assert.equal(result.ok, false);
    assert.match(result.error, /not a valid work-log slug/);
  });

  it("fix with no trailers at all errors on Work-Log first", () => {
    const result = validateCommitMessage("fix: something");
    assert.equal(result.ok, false);
    assert.match(result.error, /Work-Log/);
  });

  it("fix missing Caught-By (Work-Log present)", () => {
    const msg = "fix: something\n\nWork-Log: 2026-09-10-thing";
    const result = validateCommitMessage(msg);
    assert.equal(result.ok, false);
    assert.match(result.error, /Caught-By/);
  });

  it("fix missing Discovered-In", () => {
    const msg =
      "fix: something\n\nCaught-By: automated-test\nWork-Log: 2026-09-10-thing";
    const result = validateCommitMessage(msg);
    assert.equal(result.ok, false);
    assert.match(result.error, /Discovered-In/);
  });

  it("fix invalid Caught-By value", () => {
    const msg =
      "fix: something\n\nCaught-By: ci-bot\nDiscovered-In: Phase-5\nWork-Log: 2026-09-10-thing";
    const result = validateCommitMessage(msg);
    assert.equal(result.ok, false);
    assert.match(result.error, /Caught-By value "ci-bot" is not valid/);
  });

  it("fix invalid Discovered-In value", () => {
    const msg =
      "fix: something\n\nCaught-By: automated-test\nDiscovered-In: Phase-7\nWork-Log: 2026-09-10-thing";
    const result = validateCommitMessage(msg);
    assert.equal(result.ok, false);
    assert.match(result.error, /Discovered-In value "Phase-7" is not valid/);
  });
});
