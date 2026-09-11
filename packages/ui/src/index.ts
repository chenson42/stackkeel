// @repo/ui — the shared component library. One canonical implementation
// per primitive, promoted here the moment two apps need it (UX-PATTERNS
// § 1: shared-first). Comments on individual exports capture the load-
// bearing lessons that shaped them, with predecessor-app history removed.
export { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogMedia, AlertDialogOverlay, AlertDialogPortal, AlertDialogTitle, AlertDialogTrigger } from "./components/ui/alert-dialog";
export { Button, buttonVariants } from "./components/ui/button";
export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
} from "./components/ui/dialog";
export {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "./components/ui/dropdown-menu";
export { Switch } from "./components/ui/switch";
export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
} from "./components/ui/card";
export { AppBadge, type AppBadgeApp, type AppBadgeProps } from "./components/ui/app-badge";
export { StatusPill, type StatusPillVariant } from "./components/ui/status-pill";
export { AppMark, type AppMarkApp, type AppMarkProps } from "./components/ui/app-mark";

// admin app (Increment 2 of 2026-09-04-identity-access-nav-consolidation,
// DECISION-054/055). RoleMatrix is a new primitive, generic over apps/
// levels/cells (Phase 2's binding condition) — see role-matrix.tsx's own
// header for the full design rationale. Table/Input/DataTable are promoted
// from a predecessor app (Phase 1's recommendation,
// Phase 2 approved against the five-point dependency criteria) — the first
// packages/ui components/dependency (@tanstack/react-table) outside
// Radix/cva.
export {
  RoleMatrix,
  type RoleMatrixApp,
  type RoleMatrixLevel,
  type RoleMatrixCells,
  type RoleMatrixProps,
} from "./components/ui/role-matrix";

// Checkbox + RoleMultiSelect (2026-09-10-app-scoped-roles-and-multiselect,
// Increment 2). RoleMatrix's own person x app x level GRID stays — it's
// still used by /roles and ApproveRequestDialog — but ADMIN's /users/[id]
// now renders a flat, per-app-grouped checkbox multiselect instead: "which
// roles does this user have" is a flat question once every role name is
// app-scoped (Increment 1). See role-multi-select.tsx's own header for the
// full rationale, including why per-app grouping headers stay even though
// the list itself is flat.
export { Checkbox } from "./components/ui/checkbox";
export {
  RoleMultiSelect,
  type RoleMultiSelectProps,
} from "./components/ui/role-multi-select";
export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
} from "./components/ui/table";
export { Input } from "./components/ui/input";
export { DataTable } from "./components/ui/data-table";
export {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
  InputOTPSeparator,
} from "./components/ui/input-otp";

// Sidebar-nav primitive (2026-09-04-portal-sidebar-nav, DECISION-056/057).
// Third occurrence of the fixed-width-aside + accent-bar-group-label +
// pathname-active-state + mobile-hamburger-drawer pattern (first hand-rolled
// in apps/admin's AppSidebarNav) — generalized here, auth-blind by
// construction. See sidebar-nav.tsx's own header for the full rationale and
// why it's deliberately NOT named `Sidebar` (one predecessor app's own heavier,
// unrelated shadcn Sidebar system already owns that name, app-locally).
export {
  SidebarNav,
  type SidebarNavItem,
  type SidebarNavGroup,
  type SidebarNavProps,
} from "./components/ui/sidebar-nav";

// Convergence sidebar (2026-09-05 Increment E) — the shadcn Sidebar system
// promoted out of a predecessor app so all three apps share the richer nav
// (collapse-to-icon, tooltips, ⌘B, cookie-persisted state, mobile sheet).
// Reverses DECISION-056 point 2's assumed direction; see app-sidebar.tsx.
// `AppSidebar` accepts the SAME `groups` shape `SidebarNav` does, so call
// sites swap in one line and keep their own feature filtering untouched.
export { AppSidebar, type AppSidebarProps } from "./components/ui/app-sidebar";
export {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInput,
  SidebarInset,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
  useSidebar,
} from "./components/ui/sidebar";
export { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./components/ui/tooltip";
export { Separator } from "./components/ui/separator";
export { Skeleton } from "./components/ui/skeleton";
export {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "./components/ui/sheet";

// Cross-app switcher primitive (2026-09-04-cross-app-switcher,
// DECISION-059/060). Auth-blind by construction — see app-switcher.tsx's
// own header for the full rationale, including why `tiles` is deliberately
// narrower than the Phase 2 sketch (no `name`/`accentColor` props).
export { AppSwitcher, type AppSwitcherProps } from "./components/ui/app-switcher";

// User/account menu primitive (2026-09-05, cross-app UI-consistency audit).
// Promoted from Portal's own user-menu.tsx. Carries identity, Account
// settings, and Sign out only — app-level settings belong in the app's own
// sidebar (Chris, 2026-09-05); see that file's header.
export { UserMenu, type UserMenuProps } from "./components/ui/user-menu";

// Shared page-header primitive (2026-09-05) — title + optional description
// + optional actions slot. The description is hidden below `sm` per Chris's
// direction; see page-header.tsx's own header for why that lives here rather
// than in ~45 hand-rolled copies.
export { PageHeader, type PageHeaderProps } from "./components/ui/page-header";

// Shared back-navigation primitive (2026-09-07-back-nav-and-shell-consistency,
// Phase 4 Increment 1). Presentational-only Server Component — takes an
// already-validated href/label, matching PageHeader's own contract. The
// prefix-matching algorithm is the separate pure `resolveBackLink` helper
// below; each app owns its own route-prefix table locally (same
// shared-mechanism/per-app-data split as FEATURES). See back-link.tsx's own
// header for the full rationale.
export { BackLink, type BackLinkProps } from "./components/ui/back-link";
export {
  resolveBackLink,
  type BackLinkRoute,
  type BackLinkFallback,
} from "./lib/back-link";

// Shared account-settings surface (2026-09-05-account-menu-restructure).
// A shell plus prop-gated sections — the three apps support genuinely
// different account capabilities, so a fixed section list would render dead
// UI in two of them. See account-settings-dialog.tsx's own header.
export {
  AccountSettingsDialog,
  AccountSection,
  type AccountSettingsDialogProps,
  type AccountSectionProps,
} from "./components/ui/account-settings-dialog";
export {
  ChangePasswordSection,
  type ChangePasswordInput,
  type ChangePasswordSectionProps,
} from "./components/ui/change-password-section";
export {
  TwoFactorStatusSection,
  type TwoFactorStatusSectionProps,
} from "./components/ui/two-factor-status-section";

// hasAppSwitcherSiblings/AppSwitcherAppId/AppSwitcherTile/APP_SWITCHER_CONFIG
// are re-exported from app-switcher-types.ts directly, NOT via
// app-switcher.tsx — that file starts with "use client", and Next.js treats
// every export of a "use client" module (including re-exports) as a
// client-boundary reference. A Server Component (every app's own header
// wrapper, and — as of 2026-09-10 — ADMIN's /roles page, which needs the
// canonical PORTAL/ADMIN names) needs a plain, non-"use client"
// module to import from (2026-09-04 loop-back — found live as a
// runtime-only error on dynamic routes, invisible to typecheck/build). See
// app-switcher-types.ts's own header for the full incident, and
// apps/admin/docs/work-log/2026-09-10-2fa-input-and-app-labels.md Defect 2
// for why APP_SWITCHER_CONFIG joined this export list.
export {
  hasAppSwitcherSiblings,
  APP_SWITCHER_CONFIG,
  type AppSwitcherAppId,
  type AppSwitcherTile,
  type AppSwitcherConfigEntry,
} from "./components/ui/app-switcher-types";

// Label primitive (2026-09-04-shared-login-component, Increment A).
// Promoted from a predecessor app — Phase 2's
// flagged loose end (a predecessor app had its own local Label wrapper, Portal used
// raw <label> tags, neither routed through a shared primitive). Byte-
// identical logic; only the `cn` import path changed.
export { Label } from "./components/ui/label";

// Shared login components (2026-09-04-shared-login-component, Increment A,
// Phase 3). CredentialsSignInForm/TotpVerifyForm absorb every real per-app
// sign-in difference Phase 1 found (Google OAuth, Turnstile CAPTCHA,
// forgot-password, recovery codes) as prop-gated slots — never an app-name
// branch baked into the component. packages/auth does not gain a shared
// authorize() or credentials action (Phase 2's explicit ruling); these
// components only ever call the submission logic they're given via props
// and render the result. Not yet wired into any app's real sign-in page —
// that's Increments B/C/D, sequenced after this one and Increment A's
// packages/auth half.
export {
  CredentialsSignInForm,
  type CredentialsSignInFormProps,
} from "./components/auth/credentials-sign-in-form";
export {
  TotpVerifyForm,
  type TotpVerifyFormProps,
} from "./components/auth/totp-verify-form";
export { type AuthFormResult } from "./components/auth/types";

// Timezone-safe date rendering (2026-09-05). Promoted from Portal + Admin,
// which carried byte-identical copies. NOT for a predecessor app — see the
// component's own header: one predecessor app's date-only columns need the opposite
// (UTC-pinned) treatment per its DECISION-019.
export { FormattedDate } from "./components/shared/formatted-date";

export type { ActionResult } from "./types/actions";
export {
  FeedbackForm,
  type FeedbackFormProps,
  type FeedbackFormValues,
} from "./components/ui/feedback-form";

// "My feedback" self-status view (Increment 5,
// 2026-09-06-feedback-status-view.md) — a pure renderer, handed rows via
// `fetchItems`, never a user id. See my-feedback-list.tsx's own header.
export {
  MyFeedbackList,
  type MyFeedbackItem,
  type MyFeedbackListProps,
} from "./components/ui/my-feedback-list";

// Mobile-forward nav pair for portal-style surfaces (UX-PATTERNS § 2):
// top nav ≥ md, fixed bottom tab bar < md, both safe-area-aware for the
// native shell. Items come from a caller-owned pure-data registry.
export { TopNav, BottomTabs, type MobileNavItem } from "./components/ui/mobile-nav";
