import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

describe("verify-email page — neon-http constraint", () => {
  it("does not call db.transaction() (unsupported on neon-http driver)", () => {
    const src = readFileSync(
      join(process.cwd(), "src/app/(email-verify)/account/verify-email/[token]/page.tsx"),
      "utf8",
    );
    // Check for an actual call site — comments mentioning the function name are fine.
    // "await db.transaction(" uniquely identifies an invocation (a code comment cannot be awaited).
    expect(src).not.toContain("await db.transaction(");
  });
});
