#!/bin/sh
# install-hooks.sh — Install the project's git hooks into .git/hooks/.
#
# This is the assistant-agnostic enforcement layer: Claude Code hooks give
# fast in-session feedback, but these git hooks (plus CI) are what actually
# bind, regardless of which AI assistant — or no assistant — is driving.
#
# Installs:
#   commit-msg  → scripts/commit-msg.mjs        (commit grammar)
#   pre-commit  → scripts/worklog-gate.mjs      (no code before the work-log)
#   pre-push    → pnpm kit:verify               (typecheck/lint/test/tripwires)
#
# Idempotent: safe to run repeatedly (runs on every `pnpm install` via the
# `prepare` lifecycle script). Each run overwrites the hook with the current
# content; <hook>.bak backups are also overwritten, which is fine.
#
# Safe-on-no-git: if .git/ is absent (CI shallow clone, deployed env, Vercel
# build), the script prints an informational message and exits 0.

set -e

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || true

if [ -z "$REPO_ROOT" ] || [ ! -d "$REPO_ROOT/.git" ]; then
  echo "No .git directory found — skipping hook installation"
  exit 0
fi

HOOKS_DIR="$REPO_ROOT/.git/hooks"

install_hook() {
  NAME="$1"
  BODY="$2"
  TARGET="$HOOKS_DIR/$NAME"
  if [ -f "$TARGET" ]; then
    cp "$TARGET" "$TARGET.bak"
  fi
  printf '#!/bin/sh\n%s\n' "$BODY" > "$TARGET"
  chmod +x "$TARGET"
}

install_hook "commit-msg" 'node "$(git rev-parse --show-toplevel)/scripts/commit-msg.mjs" "$1"'
install_hook "pre-commit" 'node "$(git rev-parse --show-toplevel)/scripts/worklog-gate.mjs" --pre-commit'
install_hook "pre-push" 'cd "$(git rev-parse --show-toplevel)" && pnpm kit:verify'

echo "git hooks installed: commit-msg, pre-commit, pre-push"
