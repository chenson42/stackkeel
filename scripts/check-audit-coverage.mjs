#!/usr/bin/env node
/**
 * Audit-coverage tripwire. AGENTS.md Invariant 6 says security-sensitive
 * mutations call recordAudit(). This script gives that invariant teeth.
 *
 * Heuristic: any `actions.ts`/`actions.tsx` (or `*-action.ts`) under an app's
 * `src/app/` that contains a mutating DB call (`db.insert`, `db.update`,
 * `db.delete`, or a helper ending in `Action` performing one) MUST also call
 * `recordAudit(` or reference `auditEvents`. A file or call site can opt out
 * with an explicit comment on the line above the mutation:
 *
 *     // audit-exempt: <reason>
 *
 * Exemptions are grep-able on purpose — review them at the 30-day security
 * review. Not a proof, just a tripwire: it catches the common case where a new
 * mutation lands and the audit row is forgotten.
 *
 * Run: `node scripts/check-audit-coverage.mjs`. Exit 0 = clean.
 */
import { readdirSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function* walk(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(full);
    else if (/(^|[./-])actions?\.(ts|tsx)$/.test(e.name) || /-action\.(ts|tsx)$/.test(e.name)) {
      yield full;
    }
  }
}

const MUTATION_RE = /\bdb\s*\.\s*(insert|update|delete)\b/;
const AUDIT_RE = /\brecordAudit\s*\(|\bauditEvents\b/;
const EXEMPT_RE = /\/\/\s*audit-exempt:/i;

const failures = [];
let scanned = 0;

for (const appsDir of ["apps"]) {
  const abs = path.join(ROOT, appsDir);
  if (!existsSync(abs)) continue;
  for (const app of readdirSync(abs, { withFileTypes: true })) {
    const srcApp = path.join(abs, app.name, "src", "app");
    if (!app.isDirectory() || !existsSync(srcApp)) continue;
    for (const file of walk(srcApp)) {
      scanned++;
      const src = readFileSync(file, "utf8");
      if (!MUTATION_RE.test(src)) continue;

      // Blank out any mutation line whose previous line carries an exemption,
      // then re-test: only unexempted mutations count.
      const lines = src.split("\n");
      const filtered = lines
        .map((l, i) => (EXEMPT_RE.test(lines[i - 1] ?? "") ? "" : l))
        .join("\n");
      if (!MUTATION_RE.test(filtered)) continue;

      if (!AUDIT_RE.test(src)) {
        failures.push(
          `${path.relative(ROOT, file)} — contains DB mutations but no recordAudit()/auditEvents ` +
            `reference. Add the audit call or annotate the mutation with \`// audit-exempt: <reason>\`.`,
        );
      }
    }
  }
}

if (failures.length) {
  console.error(`[check-audit-coverage] FAIL — ${failures.length} file(s):\n`);
  for (const f of failures) console.error(`  • ${f}`);
  console.error(
    "\nAGENTS.md Invariant 6: security-sensitive mutations are audited. The exempt\n" +
      "comment is the only sanctioned opt-out, and it is reviewed on the security cadence.",
  );
  process.exit(1);
}
console.log(`[check-audit-coverage] PASS — ${scanned} action file(s) scanned, all mutations audited or exempted.`);
