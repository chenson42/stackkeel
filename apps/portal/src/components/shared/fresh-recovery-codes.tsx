"use client";

import { useEffect } from "react";

interface FreshRecoveryCodesProps {
  codes: string[];
  /**
   * Server Action to call immediately after the codes are rendered.
   * Must delete the one-time fresh-codes cookie so the codes do not
   * re-display on subsequent page reloads.
   *
   * Performing the deletion here (in a client useEffect that calls a Server
   * Action) rather than in the Server Component render satisfies the Next.js 16
   * rule that cookie mutation is forbidden during RSC render.
   */
  onDisplayed: () => Promise<void>;
}

/**
 * Displays a one-time set of recovery codes and clears the cookie that
 * delivered them as soon as the component mounts.
 *
 * The parent Server Component reads the fresh-codes cookie (reading is allowed
 * in RSC render) and passes the codes as a prop. This component is responsible
 * for the mutation side: it fires `onDisplayed` in a useEffect so the deletion
 * runs inside a Server Action, not during RSC render.
 */
export function FreshRecoveryCodes({
  codes,
  onDisplayed,
}: FreshRecoveryCodesProps) {
  useEffect(() => {
    // Fire-and-forget: clear the cookie now that the codes are visible to the
    // user. We do not await or handle errors — if the delete fails the cookie
    // will expire naturally via its maxAge (5 minutes). The codes are already
    // rendered so the user has seen them regardless.
    void onDisplayed();
    // onDisplayed is a Server Action reference; it is stable across renders and
    // must not be included in the dependency array to avoid double-firing on
    // StrictMode's double-invoke in development.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="mt-6 rounded-md border border-amber-500/40 bg-amber-500/10 p-4">
      <h2 className="text-sm font-semibold text-amber-700 dark:text-amber-300">
        Save these recovery codes
      </h2>
      <p className="mt-1 text-xs">
        Each code lets you sign in once if you lose your authenticator. We hash
        codes at rest — this is the only time you&apos;ll see them in plaintext.
      </p>
      <ul className="mt-3 grid grid-cols-2 gap-2 font-mono text-sm">
        {codes.map((c) => (
          <li key={c} className="rounded bg-background px-2 py-1">
            {c}
          </li>
        ))}
      </ul>
    </div>
  );
}
