/**
 * Tiny pub/sub for the device-revoked signal (module `mobile`). The api
 * client triggers it on a 401 `device_revoked`; the root layout subscribes
 * and returns the user to pairing. Imports nothing — no cycles.
 */
type Listener = () => void;
const listeners = new Set<Listener>();

export function onRevoked(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function triggerRevoked(): void {
  for (const l of [...listeners]) l();
}
