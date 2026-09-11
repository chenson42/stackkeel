import "server-only";

/**
 * Verify a Cloudflare Turnstile token server-side.
 *
 * Returns true (no-op) when TURNSTILE_SECRET_KEY is not configured — the
 * starter default. Forms work unchanged with no keys set.
 *
 * Fail-open posture (DECISION-026): a Cloudflare outage returns true so users
 * are never locked out by a third-party infrastructure failure.
 * Fork operators who need fail-closed: change `return true` in the catch block
 * to `return false`.
 */
export async function verifyTurnstile(
  token: string | undefined | null,
  ip?: string | null,
): Promise<boolean> {
  const secretKey = process.env.TURNSTILE_SECRET_KEY;
  if (!secretKey) return true; // no-op when unconfigured

  if (!token) return false; // no token when configured = bot or bypass attempt

  try {
    const body = new URLSearchParams({ secret: secretKey, response: token });
    if (ip) body.append("remoteip", ip);
    const res = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      { method: "POST", body },
    );
    const data = (await res.json()) as { success: boolean };
    return data.success === true;
  } catch {
    // Fail-open: see DECISION-026. Change to `return false` for fail-closed.
    return true;
  }
}
