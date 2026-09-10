# UI Standards

> **Cross-app shell, navigation, overlay-surface, and shared-component policy live in
> `UX-PATTERNS.md`.** That file owns the signed-in shell anatomy, navigation placement
> (profile menu vs. app menu), the surface-selection ladder, the `packages/ui`
> shared-component policy, account-settings-as-dialog, page-title rules (`PageHeader`),
> and error/toast standards. It wins over this document where the two overlap.
>
> **This file owns the page- and component-level detail:** form state patterns,
> unsaved-changes guards, date ranges, select/combobox patterns, loading and error
> states, four-state component design, empty states, back-navigation and the `?from=`
> convention, action bars, the accessibility checklist, and the pre-merge UX audit
> checklist. Read `UX-PATTERNS.md` first — several sections below assume it.

Conventions for building consistent, accessible UI across every app in this workspace.
Every rule below is checkable by reading a diff. A standards doc that does not claim an
app is not applied to it — these rules bind the Portal, the Admin app, and any app added
later, from the day it exists.

**Scope:** all pages under each app's `src/app/`. Exceptions are noted inline.

---

## Contents

- [Page Layout](#page-layout)
- [Action Bar](#action-bar)
- [Back Navigation](#back-navigation)
- [Mutations, Toasts & Error Feedback](#mutations-toasts--error-feedback)
- [Forms — State Patterns](#forms--state-patterns)
- [Forms — Unsaved Changes Guard](#forms--unsaved-changes-guard)
- [Date Ranges](#date-ranges)
- [Select & Combobox Patterns](#select--combobox-patterns)
- [Loading & Error States](#loading--error-states)
- [Four-State Component Design](#four-state-component-design)
- [Empty States](#empty-states)
- [Accessibility](#accessibility)
- [Pre-merge UX Audit Checklist](#pre-merge-ux-audit-checklist)

---

## Page Layout

Two patterns. Pick by **content type**, not by whether the page has a back link.

### Full-width — list and browse pages

Used for card grids, multi-column tables, and hub/index pages.

```tsx
import { Button, DataTable, PageHeader } from "@repo/ui";

return (
  <div className="space-y-6">
    <PageHeader
      title="Members"
      description="All active members."
      count={members.length}
      countLabel="members"
      actions={canCreate && <Button onClick={handleCreate}>Add member</Button>}
    />
    <DataTable columns={columns} data={members} />
  </div>
);
```

`PageHeader` and `DataTable` are shared `@repo/ui` components (`UX-PATTERNS.md` § 1) —
every list page follows this exact shape. The only thing that varies is where `canCreate`
comes from: `hasFeature(session.user.features, FEATURES.X)`.

### Constrained-width — forms, settings, and detail pages

Used for single-record detail views, settings panels, and form editors. Use `max-w-xl`
through `max-w-4xl` depending on content density — left-aligned, no `mx-auto`.

```tsx
import { PageHeader } from "@repo/ui";

return (
  <div className="max-w-2xl space-y-8">
    <PageHeader title="Edit member" />
    <MemberForm member={member} />
  </div>
);
```

**Never add a second layer of `container`, `py-*`, `px-*`, or `mx-auto` inside a layout
that already provides outer padding.** The signed-in shell applies content padding once —
`p-6` at the shell level (`UX-PATTERNS.md` § 2). Pages rendered inside it must not wrap
their content in another padding container. (This is the single most-violated rule in the
kit's ancestry — an entire app once double-padded every page with a different column width
per page, discovered by the operator using the app.)

### Choosing the pattern

| Content type | Layout |
|---|---|
| Card grid (multiple records) | Full-width |
| Multi-column table (`DataTable`) | Full-width |
| Single-record detail | Constrained |
| Form or settings panel | Constrained |
| Simple stacked list (single column) | Constrained |

---

## Action Bar

Every page with primary actions passes them via `PageHeader`'s `actions` prop
(`UX-PATTERNS.md` § 6 owns `PageHeader` itself — this section is about ordering *within*
that slot).

**Rule: text-labeled buttons always come before icon-only buttons.**

```
[Primary action] [Secondary action] | [icon-only] [icon-only]
←— text-labeled ——————————————————→ ←—— icon-only ————————→
```

- Text-labeled buttons use `Button` `default` or `outline` variant, shown only when the
  user's permissions allow the action.
- Icon-only utility buttons (settings, export, help) use `variant="outline"` +
  `size="icon"` + a `title` attribute. Always icon-only — never add a text label.
- Icon-only buttons come **after** all text-labeled buttons, always.
- Action buttons (Create, Add, New) live in `PageHeader`'s `actions` prop — never inside
  a `DataTable`/list search-and-filter toolbar.

---

## Back Navigation

Detail and sub-pages reachable from multiple origins use a `?from=<full-path>` convention
so the back link always points at the real origin.

### Visual style

Use `@repo/ui`'s `BackLink` — never a hand-rolled `<Link>`, and never a `<Button>`
component. (This promotion once replaced fifteen call sites, ten of them already-correct
hand-rolled copies, specifically so a sixteenth spelling of the icon className can't
appear again.)

```tsx
import { BackLink } from "@repo/ui";

<BackLink href={backHref} label="Back to Members" />
```

`BackLink` is presentational only — `href` and `label` must already be fully resolved
before this component sees them. When a click must be intercepted (the Unsaved Changes
Guard below) use a native `<button>` with the same classes `BackLink` renders internally.

### `?from=` URL convention

**Linking page** — append `?from=<current-path>` to any link that may need a back button:

```tsx
<Link href={`/members/${id}?from=/members`}>View member</Link>
```

**Receiving page** — read `from` from `searchParams` and resolve both `href` and `label`
with `@repo/ui`'s `resolveBackLink(from, table, fallback)` rather than hand-rolling a
`.startsWith()` check. A bare `.startsWith()` against one hardcoded prefix accepts a
same-text-prefix false match like `/members-evil` against `/members` — `resolveBackLink`
requires an exact match or a `/` or `?` boundary after the prefix. `table` is a per-page
`{prefix, name}[]` allowlist; the returned `label` always reads `Back to <name>`, never a
bare `Back`.

```tsx
import { BackLink, resolveBackLink, type BackLinkRoute } from "@repo/ui";

const MEMBER_BACK_ROUTES: readonly BackLinkRoute[] = [
  { prefix: "/members", name: "Members" },
  // …every other page that links into this one
];

export default async function MemberDetailPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const { from } = await searchParams;
  const { href, label } = resolveBackLink(from, MEMBER_BACK_ROUTES, {
    href: "/members",
    name: "Members",
  });

  return <BackLink href={href} label={label} />;
}
```

**Validation rule:** only accept `from` values that match a known prefix exactly or at a
`/`/`?` boundary. Unknown, malformed, or external values fall back to the hardcoded
default — which carries its own `name`, so the fallback never renders bare `Back`. Never
pass `from` through without validation.

### Multi-level chains

An intermediate page that receives `?from=` **and** links onward embeds its own full URL —
including the `?from=` it received — as the `from` value on outgoing links, wrapped in
`encodeURIComponent()`; the receiver decodes before validating.

### Pages with a fixed origin

Pages that always navigate back to the same place don't need `?from=` — hardcode the
`href`.

---

## Mutations, Toasts & Error Feedback

General standards — the `<Toaster>` config, the boxed inline-error treatment, and
"validation feedback belongs inline, not in a toast" — are owned by `UX-PATTERNS.md` § 7.
This section covers how a mutation's result reaches the point where those standards apply.

Server actions return `ActionResult<T>` (from `@repo/ui`'s types):

```typescript
export type ActionResult<T = void> =
  | { ok: true; data?: T }
  | { ok: false; error: string };
```

Client components read the result and call the appropriate toast:

```tsx
const result = await updateProfile({ name: value });
if (result.ok) {
  toast.success("Name updated.");
} else {
  toast.error(result.error);
}
```

Rules:

- Never call `toast()` inside a `'use server'` function or a route handler — it is
  browser-only. The client component that invoked the mutation owns the toast.
- The `error` string in `ActionResult` is **end-user-visible** — short and non-technical.
  "Email already in use." not "UniqueConstraintViolationError: users.email".
- Server actions never throw for authorization outcomes — they return typed results
  (`ok: false` with a safe message, or a discriminated `forbidden` variant for callers
  that need to branch). Throwing is for genuinely exceptional states.

---

## Forms — State Patterns

Default to plain HTML forms with `useState` and `e.preventDefault()`:

```tsx
"use client";

import { useState } from "react";
import { toast } from "sonner";
import { myServerAction } from "./actions";

export function MyForm({ initialValue }: { initialValue: string }) {
  const [value, setValue] = useState(initialValue);
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    const result = await myServerAction({ value });
    setPending(false);
    if (result.ok) {
      toast.success("Saved.");
    } else {
      toast.error(result.error);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label htmlFor="field" className="block text-sm font-medium">
          Field label
        </label>
        <input
          id="field"
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
        />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50"
      >
        {pending ? "Saving…" : "Save"}
      </button>
    </form>
  );
}
```

- **The server action is always the authoritative validator** (Zod schemas in the shared
  validation modules) — never rely solely on client-side checks.
- **When to add `react-hook-form` + client-side `zod`:** more than four fields,
  cross-field validation, or per-field error display becoming unwieldy with plain
  `useState`. New dependencies go through the architect (Phase 2).
- Show a loading indicator during `pending` and disable the submit button.
- After a successful save on a long form, scroll to top so the user sees the toast and
  page header.
- Validate required fields client-side on submit before calling the mutation; return
  early with `toast.error()` for obvious failures (blank required field, invalid email).

---

## Forms — Unsaved Changes Guard

Any page with an explicit Save button and multi-field editing must guard against
accidental navigation.

**Pattern:**

- Track `isDirty: boolean`; set `true` on first change, `false` after a successful save.
- Replace Back `<Link>` and Cancel elements with click handlers that check `isDirty`.
- If dirty: open a "Discard changes?" confirmation (`AlertDialog`). If clean: navigate.

```tsx
const [isDirty, setIsDirty] = useState(false);
const [discardOpen, setDiscardOpen] = useState(false);
const [pendingHref, setPendingHref] = useState<string | null>(null);

function handleNavigateAway(href: string) {
  if (isDirty) {
    setPendingHref(href);
    setDiscardOpen(true);
  } else {
    router.push(href);
  }
}
```

```tsx
<AlertDialog open={discardOpen} onOpenChange={setDiscardOpen}>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>Discard changes?</AlertDialogTitle>
      <AlertDialogDescription>
        You have unsaved changes. If you leave now, they will be lost.
      </AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel>Keep editing</AlertDialogCancel>
      <AlertDialogAction onClick={() => pendingHref && router.push(pendingHref)}>
        Discard changes
      </AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

**When to apply:** any page with a Save button where the user can make multiple changes
before saving. Does **not** apply to inline-edit patterns (a single toggle that
auto-saves).

---

## Date Ranges

Any pair of fields expressing "from X to Y" — a lease, a term, a report filter, a numeric
min/max. (This section exists because a real deployment accepted an end date earlier than
its start date, and a sweep found three of three range schemas with no ordering check —
the gap was the pattern, not the field.)

### 1. Validate the ordering — on the schema, not in the component

The rule belongs on the shared Zod object so it applies wherever that object is parsed —
client form and server action alike. A check written only in the form is bypassed by any
direct API call. Use the shared helper (`packages/ui` validations,
`endNotBeforeStart(startField, endField, message)`):

| Case | Behavior | Why |
|---|---|---|
| End before start | error attached to the **end** field | It is the field the user should change, and the one the form renders the message under |
| End equals start | **allowed** | A single-day range is legitimate |
| End absent | skip | Optional end dates are normal — an active record has no end yet |
| Start absent | skip | The start field's own `min(1)` already reports it; two errors for one mistake is worse than none |

**Compare `YYYY-MM-DD` values as strings, not as `Date`.** They sort lexicographically in
chronological order, so string comparison is exact — while `new Date("2026-03-01")`
parses as UTC midnight and can compare as the previous day in a negative-offset timezone.
This is the same failure class the `check:sql-date` tripwire exists to prevent.

### 2. Do not stop at validation — make the good path easy

- **Constrain the input.** Set `min` on the end field to the current start value (and
  `max` on the start to the current end) so the date picker won't offer an invalid day.
- **Move the end when the start moves past it** — preserve the duration, or clear the end
  if there is no natural duration.
- **Never silently discard what the user typed.**

### 3. Defaults

- A start date that is nearly always "now" may default to today. One that is genuinely
  unknown must not — a wrong default that looks deliberate is worse than an empty field.
- An end date defaults to empty. "No end yet" is a real state.
- Never default a range to something that fails its own validation.

### 4. Numeric ranges follow the same rules

`min`/`max` pairs take the same treatment — validate on the schema, constrain the inputs,
attach the error to the max field.

---

## Select & Combobox Patterns

### Searchable single-select (Popover + Command)

Use Radix `Popover` + `Command` + `CommandInput` for single-select fields with more than
~8 options. Add a `justSelected` ref so keyboard users can tab to the field and start
typing without the popover reopening after selection:

```tsx
const justSelected = useRef(false);

// In every onSelect handler:
onSelect={() => {
  justSelected.current = true;
  setValue(id);
  setOpen(false);
}}

// On the trigger:
<PopoverTrigger asChild>
  <button
    role="combobox"
    onFocus={() => {
      if (justSelected.current) { justSelected.current = false; return; }
      setOpen(true);
    }}
  >
    {selectedLabel ?? "Select…"}
  </button>
</PopoverTrigger>
```

- Use `"none"` as the sentinel for "no selection" — **never `""`**. Radix `CommandItem`
  and native `<select>` both reject empty string as a meaningful value.
- Include a clear button (X icon, ghost style) whenever a value is selected and the field
  is optional.

### Multi-select

Use a scrollable checkbox list (always visible, not a popover). A filter input appears
when there are more than ~6 options. Selected items appear as removable badges.

Do **not** use a command-palette-style popover for multi-select — it is harder to scan
and harder to keyboard-navigate with many items.

---

## Loading & Error States

Add `loading.tsx`/`error.tsx` to any route segment that does async data fetching.

- **`loading.tsx`** — skeleton shapes that match the page layout, not a full-page
  spinner. A skeleton prevents cumulative layout shift.
- **`error.tsx`** — must be `'use client'`; receives `error` and `reset`. Human-readable
  message plus a "Try again" button calling `reset()`. An error boundary in an
  unauthenticated segment (`(auth)`, password reset) must not redirect into a page that
  assumes a session — link to `/signin` instead.

```tsx
// loading.tsx
export default function Loading() {
  return (
    <div className="space-y-4">
      {[...Array(5)].map((_, i) => (
        <div key={i} className="h-12 w-full animate-pulse rounded-md bg-muted" />
      ))}
    </div>
  );
}

// error.tsx
"use client";
export default function Error({ reset }: { reset: () => void }) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">Something went wrong loading this page.</p>
      <button onClick={reset} className="text-sm underline">Try again</button>
    </div>
  );
}
```

For in-component async states (a table refetching on filter change), manage loading/error
locally and render an inline skeleton or error banner — segment-level `loading.tsx` does
not cover client-initiated re-fetches.

---

## Four-State Component Design

Every interactive element ships all four states. A component that only handles `default`
and `hover` is incomplete.

| State | What it covers |
|---|---|
| **Default** | The resting, idle appearance |
| **Hover** | Cursor over the element; affordance feedback |
| **Active / Pressed** | During a click or tap; darker or inset treatment |
| **Disabled** | `disabled` prop set; `opacity-50` + `pointer-events-none` |

```tsx
<button
  disabled={pending}
  className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background
             hover:opacity-90
             active:opacity-75
             disabled:pointer-events-none disabled:opacity-50
             transition-opacity"
>
  Save
</button>
```

Links that behave like buttons take the same state classes.

---

## Empty States

Never leave a list, table, or grid blank when there is no data.

**Minimum:** a centered card or section with (1) a brief description of what normally
appears here, and (2) a clear call to action when the user can populate the list.

```tsx
{items.length === 0 && (
  <div className="rounded-lg border border-dashed border-border py-16 text-center">
    <p className="text-sm font-medium">No items yet</p>
    <p className="mt-1 text-sm text-muted-foreground">
      Create your first item to get started.
    </p>
    {canCreate && (
      <button
        onClick={handleCreate}
        className="mt-4 rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background"
      >
        Create item
      </button>
    )}
  </div>
)}
```

A single gray sentence in the middle of the page is not an empty state.

---

## Accessibility

- **Keyboard navigation.** Every button, link, and input reachable with Tab, with a
  visible focus ring.
- **Focus rings.** `focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2`
  (or the `--ring` variable). Never suppress focus rings without replacing them.
- **Semantic HTML.** `<main>`, `<nav>`, `<section>`, `<h1>`–`<h6>` in proper hierarchy —
  a single `<h1>` via `PageHeader`.
- **Contrast.** WCAG 2.1 AA — 4.5:1 normal text, 3:1 large text and UI boundaries. Check
  new pairings before shipping (the brand engine's contract enforces this for brand
  tokens; manual pairings are on you).
- **Error announcements.** Fields with errors get `aria-invalid="true"` and
  `aria-describedby="<field-id>-error"`; the message element gets that id.
- **Touch targets.** ≥ 44×44px for primary interactive elements (icon-only toolbar
  controls may stay compact).
- **Color alone is not a signal.** Pair color with text, an icon, or an ARIA attribute.

---

## Pre-merge UX Audit Checklist

QA runs this in Phase 5 for any change that touches UI. A single unchecked box blocks the
`PASS` verdict.

- [ ] All four interaction states on every interactive element (default / hover /
      active / disabled)
- [ ] Empty state designed for every list or collection — not a blank screen, not a gray
      one-liner
- [ ] Loading state for every async fetch — skeleton or spinner chosen deliberately
- [ ] Error state with helpful, non-blaming microcopy and a recovery path ("Check your
      connection and try again." not "500 Internal Server Error")
- [ ] No native browser dialogs (`alert`, `confirm`, `prompt`) — `Dialog`/`AlertDialog`
      from `@repo/ui`
- [ ] Toast triggered only from the client after reading `ActionResult<T>` — never inside
      a `'use server'` function or route handler
- [ ] Timezone-safe dates — `<FormattedDate>` for every timestamp, no `toLocale*()` calls
      (ESLint-enforced)
- [ ] Form inputs have associated `<label>` elements (`htmlFor`) — no unlabeled inputs
- [ ] Error fields carry `aria-invalid="true"` and `aria-describedby` pointing at the
      message element
- [ ] All interactive elements reachable by Tab; focus rings visible
- [ ] Touch targets ≥ 44×44px for primary interactive elements
- [ ] Contrast meets WCAG AA on all new text/background pairings
- [ ] Semantic HTML: single `<h1>` via `PageHeader`, landmark roles where applicable
- [ ] Action bar order: text-labeled buttons left of icon-only, via `PageHeader`'s
      `actions` prop
- [ ] Every page reached by a link from elsewhere (vs. a top-level nav destination)
      renders a back link via `@repo/ui`'s `BackLink`, labeled `Back to <destination>`,
      never bare `Back`; `?from=`-derived hrefs validated by `resolveBackLink`'s prefix
      allowlist, never a bare `.startsWith()`
- [ ] `?from=` used when the page is reachable from multiple origins, validated on the
      receiving end
- [ ] No page adds its own `mx-auto` / `max-w-*` / `px-*` / `py-*` beyond the shell's
      single `p-6` — except a genuinely constrained-width page, which sets `max-w-*`
      left-aligned with no `mx-auto` and no extra padding, matching the equivalent page
      shape in the other apps
- [ ] Any new overlay surface cites its `UX-PATTERNS.md` § 4 ladder step in the design
- [ ] `loading.tsx` + `error.tsx` present in any new async route segment
- [ ] Page tested at ≥ 2 viewport widths (desktop 1440px, mobile 375px)
