# Cross-app UX patterns

Binding rules for the shell, navigation, overlay surfaces, and shared components across
the Portal and Admin apps (and the web views the native shell renders). Loaded every
session alongside `AGENTS.md`.

**Why this file exists.** The kit's ancestor projects repeatedly grew independent versions
of the same surface — four sign-out treatments, five account surfaces, two sidebar
systems, dozens of hand-rolled page headers — each found one at a time by the operator
using the apps. Each fix was cheap; rediscovering the rule each time was not. These are
the rules that came out of it.

Scope: cross-app structure and surface selection. `BRANDING.md` owns color, logo, and
type. `UI-STANDARDS.md` owns page- and component-level detail — form state, empty states,
back-navigation, select patterns, and the pre-merge UX audit checklist. When they
conflict, this file wins for anything spanning more than one app.

---

## 1. Shared-first — check `packages/ui` before building

Before creating ANY component, check whether `packages/ui` already exports it. If two apps
need the same thing, it belongs in `packages/ui`, not copied.

**Promote, don't fork.** When promoting a component into `packages/ui`, delete the
app-local copy and repoint its imports in the same change. A promotion that leaves the
original in place creates a duplicate that silently diverges on the next edit.

**Capability differences use prop-gated slots, not forks.** When apps genuinely support
different things, a shared component takes optional props/section slots and each app
passes only what it has (see `CredentialsSignInForm` and `AccountSettingsDialog`). A
hardcoded superset renders dead UI in the apps that lack the feature. The test for a
"genuine capability difference" is whether the *underlying feature* exists to have a
preference over — not an unexamined assertion that the apps differ.

## 2. Signed-in shell anatomy

Every signed-in page in every app is: **header → (sidebar + main)**.

Header, left to right:
`SidebarTrigger` · `AppSwitcher` · conditional divider · wordmark lockup (a `Link` home) ·
…flex gap… · right-aligned `UserMenu`.

- Header: `<header className="border-b border-border bg-card">`, a real landmark, and it
  must NOT scroll with content.
- The divider renders only when the app switcher actually has siblings — otherwise it is a
  rule with nothing to its left.
- The logo is the app's own lockup wrapped in a `Link` to the app's home route.
- Main content padding is `p-6`, applied once, at the shell level.

On the Portal's mobile-forward surfaces, the shell may additionally use a bottom tab bar
(`BottomTabs`, hidden ≥ `md`) paired with a top nav (hidden < `md`); safe-area utilities
(`pt-safe` / `pb-safe`) are mandatory on fixed chrome so the native shell's notch and home
indicator never overlap content.

## 3. Navigation — what goes where

This is the rule most often gotten wrong. Two menus, two jobs:

| Surface | Contains | Never contains |
|---|---|---|
| **Profile menu** (avatar, top right) | identity (name/email/role), **Account settings**, **Sign out** | app settings, admin pages, feature links |
| **App menu** (sidebar) | the app's own content nav + its admin/settings pages | anything about *the signed-in user's own account* |

Consequences that are easy to miss:

- A **personal** 2FA page is an account setting, even when it lives under an `/admin/*`
  route. Test: does it read/write the *signed-in user's* own row, or someone else's? Own
  row → account. Someone else's → app admin.
- Do not duplicate an entry in both menus, and do not add page-body "quick links" to
  something already in a menu. One entry point per destination.
- **User administration belongs to the Admin app**, not to the Portal's own settings menu.
  One user surface, not three.
- **Label every sidebar group, or none of them.** An unlabelled group above a labelled one
  reads as though its items belong to nothing.
- **Sidebar chrome is defined once, in `packages/ui` — never per app.** The `--sidebar-*`
  token set is identical in every app's stylesheet, with `--identity-500` as the only
  per-app value. Do not re-add a `[data-sidebar=…]` override to an app's own stylesheet.
- **Every sidebar has a filter box** (`AppSidebar`'s `searchable`, on by default), modelled
  on macOS System Settings: narrows the menu in place, matches item *and* group labels,
  drops empty groups, says so when nothing matches. Hidden when the rail is collapsed.
- **Navigation registries are pure data.** Tiles/nav items live in a registry module with
  zero session or query imports; a single colocated `visibleTiles()` filter applies
  permissions. A tile's `isVisible` must be the same check that gates the destination
  route — tiles are hidden, never shown-then-denied, and registry metadata must never
  become a second permission check.

## 4. Overlay surfaces — the decision ladder (BINDING)

Modality is the highest-friction tool and must be justified, never the default. A bottom
sheet IS a modal. Ask in order; the first yes wins:

1. **Requires no user action at all?** (success/status feedback) → **Toast** (sonner).
   Toasts never carry the ONLY record of anything important — the outcome must also be
   visible inline. Errors that block the current task are NOT toasts → dialog or inline
   error.
2. **Did the user choose to reveal a set of options?** (tapping an avatar/⋯/sort control
   to see what's there) → **Anchored menu** (Radix DropdownMenu). Short list (≲6 items),
   text-first, anchored to its trigger. The profile/account menu is the canonical case.
3. **A decision forced by the user's action?** (confirm, choose-how-to-proceed) →
   **Centered Dialog**; destructive confirms are **AlertDialog**.
4. **Needs text input?** → **Centered Dialog** — center-anchoring keeps the field above
   the mobile keyboard. A `<textarea>` inside a bottom sheet is a violation.
5. **A distinct, simple, self-contained task with a LONG or RICH option set?** (pickers
   with previews/descriptions/icons, media, sliders) → **Bottom Sheet.** This is the
   sheet's only legitimate home. Short/simple choices do NOT warrant a sheet (step 2 or 3).
6. **Multi-step, hierarchical, or primary content?** → **A route / full-screen view.**
   Never a sheet. If a sheet needs internal navigation or a second stacked surface, it
   should have been a page.
7. **Lightweight detail peeked at while keeping context?** → **Inline expansion** before
   any overlay.

The architect enforces the ladder in Phase 2; every Phase 3 design that adds a surface
cites its ladder step.

### Performance rules for sheets and dialogs

- **Animate in/out with `translateY` + `opacity` ONLY** (~200–250ms ease-out enter, faster
  exit). Never height, top, margin, or width — layout properties re-run paint every frame
  on the main thread; transform/opacity composite off it, which is exactly what keeps the
  native shell's WebView smooth.
- **Defer heavy children.** Render the overlay shell immediately; mount heavy content
  after the open animation starts (post-paint effect / `startTransition`), with a skeleton
  where needed.
- **Scrim stays flat** (`bg-black/40`) — no `backdrop-filter` blur on overlays.
- No JS-driven drag-to-dismiss without profiling in the actual WebView.

### Accessibility

- Dialog/AlertDialog/Sheet/DropdownMenu: Radix-backed only — focus trap, Escape,
  `aria-modal`, arrow-key navigation, and focus-return come free. Hand-rolled `div`
  overlays are forbidden.
- Toasts are never the sole carrier of important information.

## 5. Account settings is a dialog, not a route

`AccountSettingsDialog` opened from the profile menu. Not a page, not a nav item, in every
app.

- Render the dialog as a **sibling** of `UserMenu`, never inside the dropdown — Radix
  unmounts dropdown content on close, which tears the dialog down the instant the item is
  selected.
- Load section data **when the dialog opens**, not in the layout — the dialog mounts in
  every signed-in header, and eager loading taxes every request to serve something most
  page views never open.
- **Multi-step flows stay routes.** 2FA enrollment (QR + recovery codes) does not belong
  nested in a dialog — the dialog reports status and links out.
- Exactly one surface per account concern, and keep it reachable *before* any gate it
  configures (an enrollment page behind a 2FA gate is unreachable by anyone who needs it).

## 6. Page titles

Use `PageHeader` (`title`, optional `description`, `count`/`countLabel`, `actions`). Never
hand-roll `<h1>` + muted `<p>`.

- Titles are `text-2xl font-semibold`, sentence case (`BRANDING.md`).
- `description` is **hidden below `sm`** — on a phone it costs the first viewport. It
  stays in the DOM for screen readers. Therefore: never put transient state ("Loading…")
  in `description`; it would be invisible on mobile.
- The accent bar reads `--identity-500`, which each app defines. Never hardcode a hue.

## 7. Errors, toasts, and feedback

- Inline form errors use the boxed treatment: `role="alert"` +
  `rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-foreground`.
- **Do not color small text with `--destructive` directly** — it fails WCAG AA against
  white. The boxed variant is why the tinted background exists.
- `<Toaster richColors closeButton position="top-right" />` in every app. Do not override
  `richColors` with solid fills.
- Validation feedback belongs inline, next to the form — not in a toast.

## 8. Verification rules these patterns depend on

- **A client/server boundary bug is invisible to typecheck.** Any change touching a
  `"use client"` component consumed by a Server Component needs a real browser load before
  it is called done.
- **Prefer role-scoped, exact Playwright selectors.** `getByText("Email address")` also
  matches "New email address"; use `getByRole(..., { exact: true })`. Loose selectors
  produce failures that look like product bugs and aren't.
- **When a rule is a negative, assert the negative.** The profile-menu test asserts that
  no app-settings entry is present — that is what stops it drifting back in.
- The Next.js dev-server lock is directory-scoped: an app's e2e cannot run while that
  app's dev server is up. e2e ports live well clear of the dev-port range.

## 9. When a rule here needs to change

Change it here, in the same commit as the code (AGENTS.md Workflow Rule 15). Architectural
reversals additionally get a numbered `docs/decisions.md` entry so the contradiction is
explicit rather than silent.
