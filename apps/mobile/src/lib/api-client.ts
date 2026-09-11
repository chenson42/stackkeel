/**
 * Typed API client (module `mobile`). The portal is the single source of
 * business logic (Key Invariant 14): this client does not retry, does not
 * transform 4xx into success, and does not validate inputs — failures
 * surface verbatim so screens render honest states.
 *
 * Error contract: portal endpoints return `{ reason: string }` (e.g.
 * `invalid_code`, `device_revoked`, `rate_limited`). Fetch-level failures
 * become `network_error`; unparseable bodies become `unknown_error`.
 * A 401 `device_revoked` additionally fires the revocation bus so the root
 * layout can clear state and return to pairing.
 *
 * Dependency-injected (fetch + token reader) so the parsing/dispatch logic
 * is unit-testable without native modules.
 */
import { API_BASE_URL } from "./config";
import { readDeviceToken } from "./device-token";
import { triggerRevoked } from "./revocation-bus";

export interface ApiSuccess<T> {
  ok: true;
  status: number;
  data: T;
}

export interface ApiFailure {
  ok: false;
  status: number;
  /** Machine reason code. `network_error` / `unknown_error` for non-HTTP. */
  reason: string;
}

export type ApiResult<T> = ApiSuccess<T> | ApiFailure;

export interface RequestOptions {
  /** Omit the Authorization header (the pairing exchange itself). */
  unauthenticated?: boolean;
  /** Sent as the Idempotency-Key header for retry-safe writes. */
  idempotencyKey?: string;
}

export interface ApiDeps {
  fetchImpl: typeof fetch;
  getToken: () => Promise<string | null>;
  onRevoked: () => void;
  baseUrl: string;
}

const defaultDeps: ApiDeps = {
  fetchImpl: fetch,
  getToken: readDeviceToken,
  onRevoked: triggerRevoked,
  baseUrl: API_BASE_URL,
};

export async function request<T>(
  method: "GET" | "POST" | "PATCH" | "DELETE",
  path: string,
  body: unknown,
  options: RequestOptions = {},
  deps: ApiDeps = defaultDeps,
): Promise<ApiResult<T>> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (options.idempotencyKey) headers["Idempotency-Key"] = options.idempotencyKey;
  if (!options.unauthenticated) {
    const token = await deps.getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  let res: Response;
  try {
    res = await deps.fetchImpl(`${deps.baseUrl}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    return { ok: false, status: 0, reason: "network_error" };
  }

  let parsed: unknown = null;
  try {
    parsed = await res.json();
  } catch {
    parsed = null;
  }

  if (res.ok) {
    return { ok: true, status: res.status, data: parsed as T };
  }

  const reason =
    parsed !== null &&
    typeof parsed === "object" &&
    typeof (parsed as { reason?: unknown }).reason === "string"
      ? (parsed as { reason: string }).reason
      : "unknown_error";

  if (res.status === 401 && reason === "device_revoked") deps.onRevoked();
  return { ok: false, status: res.status, reason };
}

export const apiGet = <T>(path: string, options?: RequestOptions, deps?: ApiDeps) =>
  request<T>("GET", path, undefined, options, deps);
export const apiPost = <T>(path: string, body: unknown, options?: RequestOptions, deps?: ApiDeps) =>
  request<T>("POST", path, body, options, deps);
export const apiPatch = <T>(path: string, body: unknown, options?: RequestOptions, deps?: ApiDeps) =>
  request<T>("PATCH", path, body, options, deps);
