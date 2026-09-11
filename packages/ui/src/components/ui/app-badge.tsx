import { cn } from "../../lib/utils";
import { AppMark } from "./app-mark";

// The mark + text pill shown on sign-in pages and other places an app names
// itself. The mark itself is never tinted per app (BRANDING.md); only the
// label text differs.
export type AppBadgeApp = "portal" | "admin";

const APP_BADGE_CONFIG: Record<AppBadgeApp, string> = {
  portal: "PORTAL",
  admin: "ADMIN",
};

export interface AppBadgeProps {
  app: AppBadgeApp;
  className?: string;
}

export function AppBadge({ app, className }: AppBadgeProps) {
  const label = APP_BADGE_CONFIG[app];
  return (
    <span
      data-slot="app-badge"
      className={cn(
        "inline-flex items-center gap-2 rounded-full border border-border bg-muted px-2.5 py-1.5 text-xs font-medium text-muted-foreground",
        className,
      )}
    >
      <AppMark app={app} size={16} className="shrink-0" />
      {label}
    </span>
  );
}
