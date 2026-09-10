/**
 * Unit tests for the pre-push gate's push detection.
 * Marker/HEAD gating is exercised by invoking the script as a hook (integration
 * territory); these tests pin the command matcher, whose false-positive classes
 * were both discovered live (see commandContainsGitPush doc comment).
 *
 * Run via: node --test scripts/
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { commandContainsGitPush } from "./pre-push-gate.mjs";

describe("commandContainsGitPush", () => {
  // ── Pushes that must be caught ─────────────────────────────────────────────

  it("plain push", () => {
    assert.equal(commandContainsGitPush("git push origin main"), true);
  });

  it("push with flags", () => {
    assert.equal(commandContainsGitPush("git push --force-with-lease origin feature/x"), true);
  });

  it("push after && in a compound command", () => {
    assert.equal(commandContainsGitPush("cd /repo && git push"), true);
  });

  it("push with -C path (value-consuming global flag)", () => {
    assert.equal(commandContainsGitPush("git -C /repo push origin main"), true);
  });

  it("push with boolean global flag", () => {
    assert.equal(commandContainsGitPush("git --no-pager push"), true);
  });

  // ── Non-pushes that must pass through ──────────────────────────────────────

  it("git status", () => {
    assert.equal(commandContainsGitPush("git status"), false);
  });

  it("echo merely mentioning git push", () => {
    assert.equal(commandContainsGitPush("echo git push is mentioned here"), false);
  });

  it("grep for the phrase", () => {
    assert.equal(commandContainsGitPush("grep -rn 'git push' docs/"), false);
  });

  it("git log --grep=push (push not the subcommand)", () => {
    assert.equal(commandContainsGitPush("git log --grep=push --oneline"), false);
  });

  it('commit message mentioning "pre-push" (hyphen is a word boundary)', () => {
    assert.equal(commandContainsGitPush('git commit -m "feat(dx): add pre-push gate"'), false);
  });

  it("empty command", () => {
    assert.equal(commandContainsGitPush(""), false);
  });
});
