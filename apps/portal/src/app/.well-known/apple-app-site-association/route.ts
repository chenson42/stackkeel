/**
 * GET /.well-known/apple-app-site-association — iOS Universal Links.
 * Module `mobile`.
 *
 * Apple's CDN fetches this anonymously to verify the shell's Associated
 * Domains entitlement. appID = "<APNS_TEAM_ID>.<APNS_BUNDLE_ID>" — both are
 * PUBLIC Apple identifiers, not secrets. When either env var is missing the
 * response degrades to an empty details array (Universal Links disabled)
 * rather than 500ing: this endpoint must always return valid JSON, and it
 * must never sit behind a feature flag (Apple caches up to 24h; a flag-off
 * window would silently break links).
 */
import { NextResponse } from "next/server";

export async function GET(): Promise<NextResponse> {
  const teamId = process.env.APNS_TEAM_ID;
  const bundleId = process.env.APNS_BUNDLE_ID;

  const details =
    teamId && bundleId
      ? [
          {
            appID: `${teamId}.${bundleId}`,
            // "*" — the whole portal opens in the shell when installed; a
            // fork narrowing this edits one array.
            paths: ["*"],
          },
        ]
      : [];

  return NextResponse.json(
    {
      applinks: {
        apps: [] as string[], // required by the spec; omitting breaks older iOS validators
        details,
      },
    },
    { headers: { "Cache-Control": "public, max-age=3600" } },
  );
}
