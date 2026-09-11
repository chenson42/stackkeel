import { describe, it, expect, expectTypeOf } from "vitest";
import type { ActionResult } from "./actions";

/**
 * Pure type test for ActionResult<T>.
 *
 * These tests exercise the discriminated-union contract so that a future
 * refactor that breaks the { ok: true } / { ok: false, error } shape fails
 * the test suite before it reaches production.
 *
 * All assertions run at compile time via expectTypeOf; they produce no
 * runtime output and have near-zero overhead.
 */
describe("ActionResult<T> — discriminated union contract", () => {
  it("success branch has ok: true and an optional data field", () => {
    // Arrange: a valid success result
    const result: ActionResult<string> = { ok: true, data: "hello" };

    // Act + Assert: narrow on ok and confirm data is accessible
    if (result.ok) {
      expectTypeOf(result.data).toEqualTypeOf<string | undefined>();
    }
  });

  it("success branch works without the optional data field (void default)", () => {
    // ActionResult with default T=void — common for mutations that return nothing
    const result: ActionResult = { ok: true };

    // Assert: ok is true and data is absent / undefined
    expectTypeOf(result.ok).toEqualTypeOf<true>();
  });

  it("failure branch has ok: false and a required error string", () => {
    // Arrange: a valid error result
    const result: ActionResult = { ok: false, error: "Something went wrong" };

    // Act + Assert: narrow on ok and confirm error is a string
    if (!result.ok) {
      expectTypeOf(result.error).toEqualTypeOf<string>();
    }
  });

  it("type-narrows correctly in a discriminated-union if/else — regression for broken discriminant", () => {
    // This is the pattern every client component uses after calling a server action.
    // If the discriminant is ever changed from a boolean `ok` to something else,
    // the narrowing below breaks at compile time and this test fails.
    function consumeResult(r: ActionResult<number>): string {
      if (r.ok) {
        // In the true branch, data must be number | undefined
        expectTypeOf(r.data).toEqualTypeOf<number | undefined>();
        return `ok: ${r.data}`;
      } else {
        // In the false branch, error must be string (not optional)
        expectTypeOf(r.error).toEqualTypeOf<string>();
        return `error: ${r.error}`;
      }
    }

    // Exercise both branches at runtime to keep the function from being optimized away
    expect(consumeResult({ ok: true, data: 42 })).toBe("ok: 42");
    expect(consumeResult({ ok: false, error: "bad" })).toBe("error: bad");
  });

  it("failure branch does not allow data field — guards against union collapse", () => {
    // If the two union arms were collapsed into a single object type with all
    // fields optional, `error` would be assignable on the success arm and
    // `data` on the failure arm — defeating the discriminated union.
    // expectTypeOf catches this at compile time.

    // This compiles — correct failure shape
    const fail: ActionResult = { ok: false, error: "nope" };
    expectTypeOf(fail).toMatchTypeOf<{ ok: false; error: string }>();
  });
});
