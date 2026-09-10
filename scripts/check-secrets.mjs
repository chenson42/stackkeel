#!/usr/bin/env node
/**
 * Secrets tripwire. This kit ships as a public template — no real credential
 * may ever be committed. A tripwire like this says nothing about git history
 * (a value already in a past commit is still public regardless of what this
 * script finds today); it only sees the CURRENT tracked tree, and is not a
 * substitute for GitHub push protection — it's the fast local layer.
 *
 * `checkSecrets(files)` is the pure, testable core — takes an array of
 * `{ path, content }` and returns violations with no disk/git access, so its
 * rules can be exercised directly in check-secrets.test.mjs. The CLI entry
 * point below is the only thing that touches `git ls-files`/`readFileSync`.
 *
 * Two tiers:
 *
 *   1. HARD patterns (private keys, cloud-provider API key shapes, JWTs) —
 *      these should never appear in this repo under any circumstance, so
 *      there is no annotation escape hatch for them.
 *   2. SOFT patterns (an env-var-shaped SECRET/PASSWORD/TOKEN/KEY assignment
 *      to a real-looking value; a connection string with embedded
 *      credentials; an email address outside the safe-domain allowlist) —
 *      these can be real findings or false positives. Exempt a specific line
 *      with a same-line or line-above `// leak-ok: <reason>` comment
 *      (`<!-- leak-ok: ... -->` in Markdown).
 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// This tripwire's own test fixtures deliberately contain synthetic
// secret-shaped strings — that's the only way to prove HARD-tier detection
// actually fires, and HARD findings correctly have no annotation escape
// hatch. Excluding this one file by exact path is narrower and safer than a
// general "test files are exempt" rule.
export const SELF_TEST_EXEMPT_PATH = "scripts/check-secrets.test.mjs";

export const BINARY_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".pdf",
  ".woff", ".woff2", ".ttf", ".eot", ".otf",
  ".zip", ".gz", ".tar", ".mp4", ".mp3", ".keystore", ".jks", ".p8", ".p12",
]);

// Domains treated as safe placeholders — extend this list when a new
// legitimate convention is added, don't annotate every occurrence one by one.
export const SAFE_EMAIL_DOMAIN_RE =
  /\.invalid$|(@|\.)example\.(com|org|net)$|@localhost$|@users\.noreply\.github\.com$|@anthropic\.com$/i;

// Not real emails at all — the `user@host` shape of a git SSH remote
// (git@github.com:org/repo.git) matches the email regex coincidentally.
export const GIT_REMOTE_EMAIL_RE = /^git@(github\.com|gitlab\.com|bitbucket\.org)$/i;

// A connection-string userinfo segment is coincidentally email-shaped once
// you look at just the "word@word.tld" tail — these local-parts are // leak-ok: the rule's own doc comment
// placeholder credential words, never a real person's mailbox.
export const CONNECTION_STRING_LOCAL_PART_RE =
  /^(password|user|pass|admin|root|xxxx|ci|app|postgres|neondb_owner)$/i;

export const OK_RE = /(\/\/|<!--)\s*leak-ok:/i;

/** @type {Array<{tier: "hard"|"soft", label: string, re: RegExp}>} */
export const PATTERNS = [
  {
    tier: "hard",
    label: "private key block",
    re: /-----BEGIN (RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY-----/,
  },
  { tier: "hard", label: "AWS access key ID", re: /\bAKIA[0-9A-Z]{16}\b/ },
  { tier: "hard", label: "Google API key", re: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  {
    tier: "hard",
    label: "GitHub token",
    re: /\bgh[pousr]_[A-Za-z0-9]{20,}\b|\bgithub_pat_[A-Za-z0-9_]{20,}\b/,
  },
  {
    tier: "hard",
    label: "Stripe live key",
    re: /\b(sk|pk)_live_[A-Za-z0-9]{10,}\b/,
  },
  { tier: "hard", label: "Slack token", re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/ },
  {
    tier: "hard",
    label: "Anthropic/OpenAI-shaped API key",
    re: /\bsk-(ant-|proj-)?[A-Za-z0-9_-]{20,}\b/,
  },
  {
    tier: "hard",
    label: "JWT-shaped token",
    re: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/,
  },
  {
    tier: "soft",
    label: "connection string with embedded credential",
    re: /(postgres|postgresql|mysql|mongodb)(\+[a-z]+)?:\/\/[^:/\s"']+:[^@/\s"']+@/,
  },
  {
    tier: "soft",
    label: "env-var-shaped secret assignment",
    // No leading \b: real env-var names commonly carry the keyword as a
    // SUFFIX after an underscore (AUTH_SECRET, SEED_ADMIN_PASSWORD), and `_`
    // is a word character, so `\bSECRET` would never match there.
    re: /(SECRET|PASSWORD|API_KEY|PRIVATE_KEY|ACCESS_TOKEN|CLIENT_SECRET)\s*[:=]\s*['"`]?[A-Za-z0-9+/=_-]{12,}['"`]?/,
  },
];

// Obvious placeholder values a SOFT match should not flag. HARD findings are
// matched regardless of this list.
export const PLACEHOLDER_VALUE_RE =
  /xxxx|changeme|your[-_]|<[a-z_-]+>|example|redacted|placeholder|password123|\$\{|process\.env|ci:ci@localhost|ci-secret|fixture|do-not-use|not-a-secret|_TEST_SECRET\b|AAAAAAAA/i;

/**
 * Pure core. `files` is `Array<{ path: string, content: string }>`.
 * Returns `Array<{ file, line, tier, label, text }>`.
 */
export function checkSecrets(files) {
  const violations = [];

  for (const { path: file, content } of files) {
    const lines = content.split("\n");

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const prevLine = i > 0 ? lines[i - 1] : "";

      for (const { tier, label, re } of PATTERNS) {
        if (!re.test(line)) continue;

        if (tier === "soft") {
          if (PLACEHOLDER_VALUE_RE.test(line)) continue;
          if (OK_RE.test(line) || OK_RE.test(prevLine)) continue;
        }
        // HARD findings never look at the annotation or the placeholder list.

        violations.push({
          file,
          line: i + 1,
          tier,
          label,
          text: line.trim().slice(0, 160),
        });
      }

      // Email-domain allowlist check (kept separate from PATTERNS since
      // it's an allowlist-of-safe rather than a pattern-of-bad).
      for (const m of line.matchAll(
        /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,
      )) {
        const email = m[0];
        if (SAFE_EMAIL_DOMAIN_RE.test(email)) continue;
        if (GIT_REMOTE_EMAIL_RE.test(email)) continue;
        const localPart = email.slice(0, email.indexOf("@"));
        if (CONNECTION_STRING_LOCAL_PART_RE.test(localPart)) continue;
        if (OK_RE.test(line) || OK_RE.test(prevLine)) continue;

        violations.push({
          file,
          line: i + 1,
          tier: "soft",
          label: `email outside the safe-domain allowlist (${email})`,
          text: line.trim().slice(0, 160),
        });
      }
    }
  }

  return violations;
}

function isMain() {
  return process.argv[1] === fileURLToPath(import.meta.url);
}

if (isMain()) {
  const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

  let tracked;
  try {
    tracked = execSync("git ls-files", { cwd: ROOT, encoding: "utf8" })
      .split("\n")
      .filter(Boolean)
      .filter((f) => !BINARY_EXTENSIONS.has(path.extname(f).toLowerCase()))
      .filter((f) => f !== SELF_TEST_EXEMPT_PATH);
  } catch {
    console.log("check-secrets: not a git repository — skipped.");
    process.exit(0);
  }

  const files = [];
  for (const file of tracked) {
    try {
      files.push({ path: file, content: readFileSync(path.join(ROOT, file), "utf8") });
    } catch {
      // deleted-but-still-tracked race, or genuinely unreadable — not this script's job
    }
  }

  const violations = checkSecrets(files);

  if (violations.length > 0) {
    const hard = violations.filter((v) => v.tier === "hard");
    const soft = violations.filter((v) => v.tier === "soft");

    console.error("Secrets guard FAILED:\n");

    if (hard.length > 0) {
      console.error(
        `${hard.length} HARD finding(s) — these must never appear in this repo, no exemption exists:\n`,
      );
      for (const v of hard) {
        console.error(`  ${v.file}:${v.line} — ${v.label}`);
        console.error(`  > ${v.text}\n`);
      }
    }

    if (soft.length > 0) {
      console.error(
        `${soft.length} SOFT finding(s) — likely real, but review before dismissing:\n`,
      );
      for (const v of soft) {
        console.error(`  ${v.file}:${v.line} — ${v.label}`);
        console.error(`  > ${v.text}\n`);
      }
      console.error(
        "  If a soft finding is a genuine false positive, annotate the SAME line\n" +
          "  or the line ABOVE with:\n" +
          "    // leak-ok: <reason>          (code)\n" +
          "    <!-- leak-ok: <reason> -->    (Markdown)\n" +
          "  Never annotate to suppress a real finding — fix or redact it instead.\n",
      );
    }

    process.exit(1);
  }

  console.log("Secrets guard passed.");
}
