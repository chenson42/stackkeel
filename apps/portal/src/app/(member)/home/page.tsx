import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { PageHeader } from "@repo/ui";
import { cachedAuth } from "@/lib/auth/cached-auth";
import { db } from "@/lib/db";
import { feedbackPromptState, whatsNewEntries } from "@/lib/db/schema";
import { FEATURES } from "@/lib/permissions";
import { FormattedDate } from "@repo/ui";
import { DashboardPanel } from "@/components/shared/dashboard-panel";
import { FeedbackPromptCard } from "./feedback-prompt-card";
import { visiblePortalTiles } from "@/lib/tiles";

// Number of What's-new entries shown in the home card.
const WHATS_NEW_HOME_LIMIT = 3;

// Server-side computation: should the daily feedback prompt card be shown?
// Uses UTC "today" for the comparison (known write-local/read-UTC imprecision — see DECISION-023).
function shouldShowFeedbackPrompt(
  state: {
    optedOut: boolean;
    lastSnoozedDate: string | null;
    lastSubmittedDate: string | null;
  } | null,
): boolean {
  if (!state) return true; // New user — no row yet. Show the card.
  if (state.optedOut) return false;
  const today = new Date().toISOString().slice(0, 10); // UTC 'YYYY-MM-DD'
  if (state.lastSnoozedDate === today) return false;
  if (state.lastSubmittedDate === today) return false;
  return true;
}

// cachedAuth() is memoized via React cache() — calling it here after the
// layout already called it costs nothing (same request, same cached result).
// Note: auth() directly is NOT memoized in next-auth v5 beta.31; the
// layout+page each calling auth() fired the Tier-A DB SELECT twice. See
// src/lib/auth/cached-auth.ts for the empirical basis.
export default async function HomePage() {
  const session = await cachedAuth();
  const user = session!.user;

  const name = user.name ?? user.email ?? "there";
  const isAdmin = (user.features ?? []).includes(FEATURES.ADMIN_DASHBOARD);

  // Feedback prompt state — query even for no-role users (their signal is valuable).
  const promptState = await db.query.feedbackPromptState.findFirst({
    where: eq(feedbackPromptState.userId, user.id),
    columns: { optedOut: true, lastSnoozedDate: true, lastSubmittedDate: true },
  });
  const showFeedbackPrompt = shouldShowFeedbackPrompt(promptState ?? null);

  // What's-new entries — latest WHATS_NEW_HOME_LIMIT only; zero entries → card hidden.
  const recentWhatsNew = await db
    .select({
      id: whatsNewEntries.id,
      emoji: whatsNewEntries.emoji,
      title: whatsNewEntries.title,
      body: whatsNewEntries.body,
      publishedAt: whatsNewEntries.publishedAt,
    })
    .from(whatsNewEntries)
    .orderBy(desc(whatsNewEntries.publishedAt))
    .limit(WHATS_NEW_HOME_LIMIT);

  return (
    <>
      <PageHeader title={<>Welcome, {name}.</>} />

      {/* Tile grid — from the pure-data registry (src/lib/tiles.ts). */}
      <section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {visiblePortalTiles(user.features).map((tile) => (
          <Link
            key={tile.id}
            href={tile.href}
            className="rounded-lg border border-border bg-card p-4 transition-colors hover:bg-muted"
          >
            <h2 className="font-medium">{tile.label}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{tile.description}</p>
          </Link>
        ))}
      </section>

      {/* What's-new card — hidden when zero entries; shown above feedback card */}
      {recentWhatsNew.length > 0 && (
        <section className="mt-8">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            What&apos;s new
          </h2>
          <ul className="mt-3 space-y-3">
            {recentWhatsNew.map((entry) => (
              <li key={entry.id} className="text-sm">
                {/* XSS invariant: all content rendered as JSX text nodes */}
                {entry.emoji && <span className="mr-1">{entry.emoji}</span>}
                <span className="font-medium">{entry.title}</span>
                <p className="mt-0.5 text-muted-foreground">{entry.body}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  <FormattedDate value={entry.publishedAt} mode="date" />
                </p>
              </li>
            ))}
          </ul>
          <Link
            href="/whats-new"
            className="mt-3 inline-block text-xs text-muted-foreground hover:text-foreground"
          >
            See all →
          </Link>
        </section>
      )}

      {/* Daily feedback prompt card — suppressed after snooze/submit/opt-out for today */}
      {showFeedbackPrompt && (
        <section className="mt-8">
          <FeedbackPromptCard />
        </section>
      )}

      {/* The "Quick links" panel (Account settings / Admin dashboard) was
          removed 2026-09-05 per Chris: both are reachable from the profile
          menu in every header, so duplicating them on the home page gave two
          entry points to the same places and made the menu look optional.
          See docs/work-log/2026-09-05-account-menu-restructure.md. */}
    </>
  );
}
