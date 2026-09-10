---
name: release-notes
description: Write or update release notes for the current change, bump the version in the root package.json (and kit.json kitVersion), and create a new minor-version file when needed
---

# Release Notes

When the user invokes `/release-notes`, write a release-notes entry for the current change, bump the version, and keep the file structure consistent. The workspace versions **as one unit**: the root `package.json` `version` is the release version, mirrored into `kit.json` → `kit.kitVersion` (forks' upstream-sync reads it). Shared packages stay `0.0.0` — they are consumed via `workspace:*`, never published.

## Style: Functional Changes Only

Release notes are written for the user — the person clicking through the app, or the engineer reading the changelog six months from now. They are **not** code review:

- **Describe behavior, not files.** "Admins can now retry a failed email from the queue" beats "Modified `email-queue/page.tsx`." Never list file paths.
- **No "Files Added" / "Files Modified" sections.** Commit history covers that.
- **Lead with Value.** Why does this matter to a user? One sentence. If you can't write it, the change belongs in a commit message, not release notes.
- **User-visible only.** Internal refactors that change no behavior get no entry. Library upgrades go in only when they affect users (security fix, perf, new capability).
- **A shared-package change is described in terms of what changed for users** of the app(s) it altered. Invisible to every user → no entry.
- **Acceptable headings inside an entry:** Value, What's New / Changes, Permissions (new feature keys — user-discoverable), New Routes (admin-discoverable only), Known follow-ups.

If you find a prior entry with file-path bullets, fix it on the way through.

## Versioning

Semantic versioning, **MAJOR.MINOR.PATCH**: MAJOR — significant new functionality, breaking changes, major milestones; MINOR — new features, enhancements; PATCH — bug fixes, minor adjustments. Release-notes filenames use the major.minor form (`docs/release-notes/v0.2.md`).

## Steps

1. **Determine the version.** Read the root `package.json`; read the newest entry in the current `docs/release-notes/vX.Y.md` (sort numerically — `v0.10` > `v0.9`). Bug fix → PATCH; feature → MINOR; breaking → MAJOR. Ask if unclear.
2. **New minor-version file if needed.** If bumping MINOR, create the new file from the template below and add a nav link at the bottom of the previous file: `→ [v0.3](v0.3.md)`. If the admin docs viewer maintains an explicit allowlist, update it.
3. **Write the entry** in the current minor-version file, newest first: add a Table of Contents row (`| [X.Y.Z](#X.Y.Z) | YYYY-MM-DD | [Type] | [One-line description] |`), then the full entry using the matching template (Feature / Enhancement / Defect Fix / Security / Infrastructure).
4. **Update guidance docs for drift** introduced by the release: `AGENTS.md` (capability map, project layout, commands), `docs/product/functionality-map.md` for every feature added/changed/removed. If none apply, note "no user-visible surface changes."
5. **Bump the version** — **only when the branch is being prepared to merge into `main`**: root `package.json` `version` AND `kit.json` → `kit.kitVersion`, kept identical. Documentation-only changes get no bump. All code changes on a branch ship as a single version.

## Templates

### Feature

```markdown
<a name="X.Y.Z"></a>
## X.Y.Z — YYYY-MM-DD

### Feature: [Feature Name]

**Value:** [Why this was built]

#### What's New

- [User-facing change]

#### Permissions

| Feature key | Required for |
|-------------|--------------|
| `area.action` | Description |

#### New Routes (admin-discoverable only)

- `GET /path` — Description
```

### Enhancement

```markdown
<a name="X.Y.Z"></a>
## X.Y.Z — YYYY-MM-DD

### Enhancement: [Brief Description]

**Value:** [Why this improvement matters]

**Changes:**
- [Functional change]
```

### Defect Fix

```markdown
<a name="X.Y.Z"></a>
## X.Y.Z — YYYY-MM-DD

### Defect Fix: [Brief Description]

**Problem:** [What the user experienced]

**Root Cause:** [Why it happened]

**Fix:** [What now happens instead]

**Testing:**
- [x] Test case 1
```

### Infrastructure / Security

Only when there is a user-visible effect (new deploy target, new auth requirement, security improvement worth telling users about). Same shape as Enhancement with a **Value / Background** line.

### New Minor Version File

```markdown
# Release Notes — vX.Y

*← [vX.(Y-1)](vX.(Y-1).md)*

---

## Table of Contents

| Version | Date | Type | Description |
|---------|------|------|-------------|
| [X.Y.0](#X.Y.0) | YYYY-MM-DD | Feature | Description |

---

[entries go here, newest first]
```
