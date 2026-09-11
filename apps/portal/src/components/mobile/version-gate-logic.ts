/**
 * Pure decision logic for AppVersionGate (module `mobile`) — extracted so the
 * five fail-open paths are unit-testable without rendering.
 *
 * Fail-open invariants (all five, in order):
 *   1. update-check flag off            → nothing
 *   2. state not yet resolved (null)    → nothing
 *   3. nativeBuild null (getInfo threw) → nothing
 *   4. latestBuild null                 → no soft banner
 *   5. minBuild null                    → no hard block
 */

export interface VersionGateState {
  nativeBuild: number | null;
  latestBuild: number | null;
  minBuild: number | null;
  platform: string | null;
}

export type VersionGateDecision = "none" | "soft-banner" | "hard-block";

export function decideVersionGate(
  updateCheckEnabled: boolean,
  state: VersionGateState | null,
): VersionGateDecision {
  if (!updateCheckEnabled) return "none"; // 1
  if (state === null) return "none"; // 2
  if (state.nativeBuild === null) return "none"; // 3

  const hardBlock = state.minBuild !== null && state.nativeBuild < state.minBuild; // 5
  if (hardBlock) return "hard-block";

  const softBanner = state.latestBuild !== null && state.nativeBuild < state.latestBuild; // 4
  return softBanner ? "soft-banner" : "none";
}
