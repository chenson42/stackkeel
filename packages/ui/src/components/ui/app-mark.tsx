// The kit's compact glyph-only brand mark: three stacked blocks forming an
// "S" silhouette, on a rounded-square badge. /personalize replaces this file
// with the fork's own mark (it is registered in scripts/kit/identity-files.json).
//
// The badge is ALWAYS the brand mark color regardless of `app` — a
// differently-colored badge per app reads as sub-brands, which contradicts
// BRANDING.md ("the mark is never tinted per app; per-app identity lives
// only in each app's UI accent"). `app` exists solely to vary the
// aria-label for accessibility (e.g. distinguishing tiles in the app
// switcher), never to vary appearance.
//
// Deliberately a SEPARATE component from AppBadge (app-badge.tsx): AppBadge
// is the mark + text pill used on sign-in pages; AppMark is the glyph-only
// form for favicided contexts and the switcher's per-app tiles.

export type AppMarkApp = "portal" | "admin" | "platform";

const BADGE_COLOR = "#3b82f6";

export interface AppMarkProps {
  app: AppMarkApp;
  size?: number;
  className?: string;
}

export function AppMark({ app, size = 24, className }: AppMarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 96 96"
      role="img"
      aria-label={`App mark — ${app}`}
      className={className}
    >
      <rect width="96" height="96" rx="20" fill={BADGE_COLOR} />
      {/* Three slanted block bands reading as an "S" — echoes the repo logo. */}
      <g fill="#ffffff">
        <path d="M36 18 L80 18 L68 34 L24 34 Z" />
        <path d="M22 40 L44 40 L44 56 L22 56 Z" />
        <path d="M50 40 L74 40 L74 56 L50 56 Z" />
        <path d="M28 62 L72 62 L60 78 L16 78 Z" />
      </g>
    </svg>
  );
}
