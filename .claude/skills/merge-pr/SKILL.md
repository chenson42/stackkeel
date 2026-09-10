---
name: merge-pr
description: Merge a PR safely — retargets any dependent PRs to main BEFORE deleting the base branch, so GitHub never auto-closes them
argument-hint: "<pr-number>"
---

# Merge a PR Safely (auto-retargets downstream PRs)

When the user invokes `/merge-pr <number>`, merge that PR while protecting any open PRs whose base branch is about to disappear. Applies the same way regardless of which app or package the PR touches — this is a GitHub-mechanics skill.

## The trap this avoids

`gh pr merge N --delete-branch` deletes the head branch after the merge commit lands on `main`. If any other open PR has that branch as its `baseRefName`, GitHub **auto-closes** those PRs — their base no longer exists. The recovery is a 5-step dance: push the deleted branch back, `gh pr reopen`, retarget to `main`, wait for mergeability, then merge.

This skill retargets dependents to `main` *before* the base branch is deleted, so nothing auto-closes.

## When to use

- Any PR you're about to merge with `--delete-branch` (which should be ~every PR).
- Stacked PRs: invoke `/merge-pr` for each one bottom-up; each call retargets the next layer.

## When NOT to use

- The PR doesn't use `--delete-branch` (the trap doesn't apply if the head branch persists).
- The PR has no dependents AND you don't care if the branch stays — plain `gh pr merge` is fine.

## Procedure

### Step 1 — Look up the PR's head branch

```bash
gh pr view <N> --json headRefName,baseRefName,state,mergeable
```

Confirm: `state` is `OPEN`, `mergeable` is `MERGEABLE` (or `UNKNOWN` — GitHub may still be computing). Note `headRefName` for Step 2.

If `state` is `CLOSED` or `MERGED`, stop. This skill prevents the trap; it does not recover from already-closed PRs.

### Step 2 — Find dependent PRs

```bash
gh pr list --base "<headRefName from Step 1>" --state open --json number,title,baseRefName
```

If the list is **empty**, skip to Step 4 — no retargeting needed.

### Step 3 — Retarget each dependent to main

For each dependent PR number `M`:

```bash
gh api repos/{owner}/{repo}/pulls/M -X PATCH -f base=main --silent
```

`{owner}` and `{repo}` are auto-substituted by `gh` from the current repository — no hardcoding.

After all retargets, verify with a single re-query:

```bash
gh pr list --base "<headRefName from Step 1>" --state open --json number
```

Result should be `[]`.

### Step 4 — Merge

```bash
gh pr merge <N> --merge --delete-branch
```

**Defaults:** `--merge` (matches the repo convention) and `--delete-branch` (the trap is now prevented). Swap `--merge` for `--squash` or `--rebase` only if the user explicitly asks.

### Step 5 — Verify

```bash
gh pr view <N> --json state,mergedAt
```

Expect `state: MERGED`. For each retargeted PR `M`, confirm it's still OPEN and now targets `main`:

```bash
gh pr view M --json state,baseRefName
```

## CI consideration

Retargeting changes a PR's base but does not push new commits, so CI configured on `pull_request` events may not re-trigger automatically. If CI must run before merge, push a `--allow-empty` commit on the head branch *after* the retarget, or escalate to the user.

## Why this exists

Multiple downstream forks independently hit the auto-close trap while merging PR stacks (one stack of 8 PRs cost ~5 minutes of branch-restore + reopen + retarget per PR). The Workflow Rules point at this skill so it's discoverable from the rules layer.
