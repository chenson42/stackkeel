---
name: test
description: Open a versioned pre-merge manual QA bank for the current branch — pulls relevant regression suites from docs/test-cases/ and adds release-specific checks from the diff
---

# Open Pre-Merge Test File

When the user invokes `/test`, create `docs/pre-merge-tests-vX.Y.Z.md` for the current branch. This file is the tester's working scratchpad: check boxes here, add notes here. It gets consumed and archived by `/test-results` after all cases pass.

## When to Use

This skill produces a **human QA pass** that complements the automated Phase 5 (qa agent) check — it does not replace it. Run `/test` when a feature branch is ready for manual verification before merge: after the qa agent has issued its verdict, or in parallel when the automated suite doesn't cover a user-facing flow end-to-end. The completed file is the input to `/test-results`, which folds the results into release notes and archives the file.

**Do not create this file if one already exists** (any file matching `docs/pre-merge-tests-v*.md`). If one exists, tell the user and ask whether to replace it or continue with the existing one.

---

## Step 1: Gather Context

Run in parallel:

```bash
git branch --show-current
node -p "require('./package.json').version"
git diff main --name-only
```

This gives the branch name, the current version (`X.Y.Z`), and the list of files changed versus `main`. The working file will be named `docs/pre-merge-tests-vX.Y.Z.md`.

---

## Step 2: Identify Relevant Test Suites

The test bank lives in `docs/test-cases/`. Each file covers one module; each `##` section covers one feature area. Pull only the sections relevant to the changed files. If a module file does not exist yet, skip it — the regression suites section will be empty, which is fine.

### Authentication (`docs/test-cases/auth.md`)

| Changed file pattern | Include section |
|---------------------|-----------------|
| `apps/portal/src/app/(auth)/signin/` | `## Sign-In` |
| `(auth)/totp/` or `packages/auth` two-factor files | `## TOTP Enrollment & Verification` |
| `apps/*/src/proxy.ts` or `packages/auth` or `apps/*/src/auth.ts` | `## Route Gate & Session` |
| `(password-reset)/` | `## Forgot Password` |
| `(email-verify)/` | `## Email Verification` |
| `access-pending/` | `## Access Pending` |

### Account (`docs/test-cases/account.md`)

| Changed file pattern | Include section |
|---------------------|-----------------|
| `(account)/account/` (not `2fa/`, not `devices/`) | `## Profile, Email & Password` |
| `(account)/account/2fa/` | `## Per-User TOTP Management` |
| `(account)/account/devices/` | `## Device Management` |

### Admin (`docs/test-cases/admin.md`)

| Changed file pattern | Include section |
|---------------------|-----------------|
| `apps/admin/src/app/**/users/` | `## Users & Roles` |
| `apps/admin/src/app/**/flags/` or the flags helper in `packages/db` | `## Feature Flags` |
| `apps/admin/src/app/**/docs/` | `## Docs Viewer` |
| `apps/admin/src/app/**/2fa/` | `## Admin 2FA Management` |
| `apps/admin/src/app/**/feedback/` | `## Feedback Triage` |
| `apps/admin/src/app/**/tickets/` | `## Helpdesk Triage` |
| `apps/admin/src/app/**/email-queue/` | `## Email Queue` |

### Portal (`docs/test-cases/portal.md`)

| Changed file pattern | Include section |
|---------------------|-----------------|
| `apps/portal/src/app/**/support/` or ticket lib files | `## Support / Tickets` |
| feedback form/prompt components | `## Feedback` |
| what's-new components | `## What's New` |

### Permissions (`docs/test-cases/permissions.md`)

| Changed file pattern | Include section |
|---------------------|-----------------|
| `packages/permissions/` or any new permission constant | `## Feature Gate` |
| flags helper or the `feature_flags` schema | `## Flag Gate` |

### Native (`docs/test-cases/native.md`)

| Changed file pattern | Include section |
|---------------------|-----------------|
| `apps/shell/` or the web mobile-bridge components | `## Shell (WebView)` |
| `apps/mobile/` or device API routes | `## Mobile App & Device Pairing` |

---

If no test bank sections are relevant (e.g., a backend-only utility change), the Regression Suites section will be empty — that's fine.

Pull the exact checkbox text from relevant sections verbatim. Preserve section headings (`##` and `###`) and checkbox format (`- [ ]` / `- [x]`). Reset any `[x]` back to `[ ]` — the pre-merge file always starts with all boxes unchecked.

---

## Step 3: Identify Release-Specific Checks

Scan the diff for signals that require one-time verification. For each signal found, add a corresponding check to the Release-Specific Checks section:

| Signal | Check to add |
|--------|-------------|
| New file in `packages/db/migrations/` | Verify migration ran — `[table/column]` present in the live DB |
| New redirect or `redirect()` call | Verify old path redirects correctly |
| New permission constant in `packages/permissions` | Verify feature gating — page accessible with permission, redirects without |
| New feature flag in seed | Verify flag toggle works in the admin flags page |
| New route group or page added | Verify the route renders without a 500 behind an authenticated session |
| Native build config change | Verify the affected platform builds and launches |
| Release notes entry contains `- [ ]` (unchecked item from a prior partial test) | Carry forward the unchecked item |
| Any comment in release notes: "verify on staging" or "not tested before merge" | Add as a check |

If no release-specific checks are identified, omit that section from the file.

---

## Step 4: Check Whether the Test Bank Needs Updating

Before writing the pre-merge file, scan the diff for new features or changed behavior that would render existing test cases stale or incomplete:

- **New UI flow or user-facing feature**: check whether the relevant `docs/test-cases/[module].md` section covers it. If the section does not exist, create the file and section with new `- [ ]` items. If the file exists but the section is missing, add it.
- **Changed behavior** (form field renamed, route changed, permission renamed): update any affected test case text in the bank file.
- **Removed feature**: remove or strike out affected test cases.

If you update any bank files, commit those changes separately **before** writing the pre-merge file:

```bash
git add docs/test-cases/[module].md
git commit -m "test: update [module] test bank for v[VERSION] changes"
```

Then pull the updated sections into the pre-merge file.

---

## Step 5: Write `docs/pre-merge-tests-vX.Y.Z.md`

Write the file with this exact structure:

```markdown
# Pre-Merge Tests — vX.Y.Z

**Version:** X.Y.Z
**Branch:** [BRANCH]
**Test Suites:** [comma-separated list of test-cases doc paths and sections included, or "none"]
**Opened:** YYYY-MM-DD

**Instructions:** Mark each item `[x]` when passed, `[!]` if an issue was found. Leave `[ ]` for items not yet tested. Add notes on the line below any item that needs them. Fill in Sign-Off and run `/test-results` when complete.

---

## Regression Suites

[Pull relevant sections verbatim from test-cases docs, with their headings.
If no sections are relevant, write: *No regression suites applicable to this change.*]

---

## Release-Specific Checks

[One-time checks for this release only.
If none, omit this section entirely.]

---

## Notes

*Add observations, defects found, or anything that needs follow-up here during testing.*

---

## Sign-Off

**Tested by:**
**Date:**
**Result:** (all pass / issues found — see Notes)

**Issues found:**
-
```

### Per-item notes format

After copying each checkbox line from a test bank section, add a `> Notes:` line immediately below it:

```markdown
- [ ] **Test case description** — steps to follow
  > Notes: _______________
```

Apply this to every checkbox line in both sections. The tester fills in the notes field for any item that needs context, leaves it blank for clean passes.

---

## Step 6: Commit the File

```bash
git add docs/pre-merge-tests-vX.Y.Z.md
git commit -m "test: open pre-merge test file for vX.Y.Z"
```

Then tell the user:

- What test suites and sections were included and why
- How many test cases total
- How many release-specific checks were added
- Remind them to fill in the Sign-Off section before running `/test-results`
