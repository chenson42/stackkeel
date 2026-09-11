/**
 * Unit tests for escapeHtml — no mocks needed, pure function.
 * Kept in a dedicated file so there is no conflict with the module-level
 * vi.mock("@/lib/email/escape-html") in the feedback actions test file.
 */
import { describe, it, expect } from "vitest";
import { escapeHtml } from "./escape-html";

describe("escapeHtml — HTML special character escaping", () => {
  it("escapes & → &amp;", () => {
    expect(escapeHtml("foo & bar")).toBe("foo &amp; bar");
  });

  it("escapes < → &lt;", () => {
    expect(escapeHtml("<script>")).toBe("&lt;script&gt;");
  });

  it("escapes > → &gt;", () => {
    expect(escapeHtml("a > b")).toBe("a &gt; b");
  });

  it('escapes " → &quot;', () => {
    expect(escapeHtml('He said "hello"')).toBe("He said &quot;hello&quot;");
  });

  it("escapes ' → &#x27;", () => {
    expect(escapeHtml("it's here")).toBe("it&#x27;s here");
  });

  it("escapes all five characters in a combined XSS payload", () => {
    const input = `<script>alert('xss & "injection"')</script>`;
    const output = escapeHtml(input);
    expect(output).not.toContain("<");
    expect(output).not.toContain(">");
    expect(output).not.toContain('"');
    expect(output).not.toContain("'");
    // & only appears in the escaped form &amp; &lt; &gt; etc.
    // Verify no raw unescaped & remains
    expect(output.replace(/&(?:amp|lt|gt|quot|#x27);/g, "")).not.toContain("&");
  });

  it("passes through plain strings unchanged", () => {
    expect(escapeHtml("hello world")).toBe("hello world");
  });

  it("handles empty string", () => {
    expect(escapeHtml("")).toBe("");
  });

  it("handles strings with no special characters", () => {
    expect(escapeHtml("No special chars here 123")).toBe(
      "No special chars here 123",
    );
  });

  it("escapes multiple occurrences of the same character", () => {
    expect(escapeHtml("a & b & c")).toBe("a &amp; b &amp; c");
  });
});
