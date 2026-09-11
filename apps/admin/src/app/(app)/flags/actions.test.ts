/**
 * Unit tests for setFlagAction (2026-09-05-admin-menu-structure).
 *
 * Covers:
 *   1. No session -> { ok: false, error: "Forbidden." }
 *   2. Session without admin.flags feature -> { ok: false, error: "Forbidden." }
 *   3. Authorized call -> setFlag() called with (db, key, { enabled }),
 *      recordAudit() called with FLAG_UPDATED + before/after metadata,
 *      returns { ok: true, data: { enabled } }.
 *   4. A brand-new flag (before === null) audits enabledBefore: null.
 *
 * vi.mock() calls are hoisted before imports by Vitest's transform.
 */

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {},
}));

const mockSetFlag = vi.hoisted(() => vi.fn());
vi.mock("@repo/db", () => ({
  setFlag: mockSetFlag,
}));

const mockHasFeature = vi.hoisted(() => vi.fn());
vi.mock("@repo/permissions", () => ({
  FEATURES: { ADMIN_FLAGS: "admin.flags" },
  hasFeature: mockHasFeature,
}));

const mockRecordAudit = vi.hoisted(() => vi.fn());
vi.mock("@/lib/audit", () => ({
  AUDIT_ACTIONS: { FLAG_UPDATED: "admin.flag.updated" },
  recordAudit: mockRecordAudit,
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import { describe, it, expect, vi, beforeEach } from "vitest";
import { setFlagAction } from "./actions";

const sessionWithFeature = {
  user: {
    id: "admin-user-id",
    email: "admin@example.com",
    features: ["admin.flags"],
  },
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("setFlagAction — auth guard", () => {
  it("returns { ok: false, error: 'Forbidden.' } when there is no session", async () => {
    const { auth } = await import("@/auth");
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    mockHasFeature.mockReturnValue(false);

    const result = await setFlagAction({ key: "auth.require_2fa", enabled: false });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("Forbidden.");
    expect(mockSetFlag).not.toHaveBeenCalled();
    expect(mockRecordAudit).not.toHaveBeenCalled();
  });
});

describe("setFlagAction — feature gate", () => {
  it("returns { ok: false, error: 'Forbidden.' } when user lacks admin.flags", async () => {
    const { auth } = await import("@/auth");
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue(sessionWithFeature);
    mockHasFeature.mockReturnValue(false);

    const result = await setFlagAction({ key: "auth.require_2fa", enabled: false });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("Forbidden.");
    expect(mockSetFlag).not.toHaveBeenCalled();
  });
});

describe("setFlagAction — authorized toggle", () => {
  it("calls setFlag with (db, key, { enabled }) and returns { ok: true, data }", async () => {
    const { auth } = await import("@/auth");
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue(sessionWithFeature);
    mockHasFeature.mockReturnValue(true);
    mockSetFlag.mockResolvedValue({
      before: { key: "auth.require_2fa", app: null, enabled: true, description: "2FA", rolloutPercent: 0 },
      after: { key: "auth.require_2fa", app: null, enabled: false, description: "2FA", rolloutPercent: 0 },
    });

    const result = await setFlagAction({ key: "auth.require_2fa", enabled: false });

    expect(mockSetFlag).toHaveBeenCalledWith({}, "auth.require_2fa", { enabled: false });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toEqual({ enabled: false });
  });

  it("audits FLAG_UPDATED with app/enabledBefore/enabledAfter metadata", async () => {
    const { auth } = await import("@/auth");
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue(sessionWithFeature);
    mockHasFeature.mockReturnValue(true);
    mockSetFlag.mockResolvedValue({
      before: { key: "tasks.module", app: "portal", enabled: false, description: null, rolloutPercent: 0 },
      after: { key: "tasks.module", app: "portal", enabled: true, description: null, rolloutPercent: 0 },
    });

    await setFlagAction({ key: "tasks.module", enabled: true });

    expect(mockRecordAudit).toHaveBeenCalledWith({
      action: "admin.flag.updated",
      resourceType: "feature_flag",
      resourceId: "tasks.module",
      metadata: { app: "portal", enabledBefore: false, enabledAfter: true },
    });
  });

  it("audits enabledBefore: null when the flag row is brand-new", async () => {
    const { auth } = await import("@/auth");
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue(sessionWithFeature);
    mockHasFeature.mockReturnValue(true);
    mockSetFlag.mockResolvedValue({
      before: null,
      after: { key: "new.flag", app: null, enabled: true, description: null, rolloutPercent: 0 },
    });

    await setFlagAction({ key: "new.flag", enabled: true });

    expect(mockRecordAudit).toHaveBeenCalledWith({
      action: "admin.flag.updated",
      resourceType: "feature_flag",
      resourceId: "new.flag",
      metadata: { app: null, enabledBefore: null, enabledAfter: true },
    });
  });
});
