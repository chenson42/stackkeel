"use client";

/**
 * MobileDeviceRegistrar — one-shot per-session native bootstrap (module
 * `mobile`). Renders nothing; in a plain browser every step no-ops.
 *
 * On mount inside the Capacitor shell:
 *   1. Hide the native splash (launchAutoHide backstops this — see
 *      apps/shell/capacitor.config.ts; calling hide() here just clears it
 *      EARLIER on a warm load).
 *   2. Register or refresh the device:
 *      - No stored device → POST /api/devices with the WebView's session
 *        cookie (credentials: "include") → store {deviceId, token} and
 *        publish the version policy.
 *      - Stored device → PATCH /api/devices/[id] with the bearer token to
 *        refresh app version + last-seen, then GET /api/app-release for the
 *        policy. A 401 clears local state and falls through to a fresh mint
 *        on the next launch (the WebView session re-registers silently).
 *   3. Publish {nativeBuild, policy, platform} into AppVersionProvider via
 *      appVersionSetterRef.
 *
 * TOKEN STORAGE: Capacitor Preferences (UserDefaults / SharedPreferences).
 * The token is device-scoped and revocable server-side; a fork wanting
 * Keychain/EncryptedSharedPreferences at-rest protection swaps the two
 * storage calls below for a secure-storage plugin — this component is the
 * only place that touches it.
 *
 * PUSH: primePushRegistration() below is a documented no-op stub — the kit
 * ships no APNs/FCM credentials. A fork implements it with
 * @capacitor/push-notifications: request permission, register, then PATCH
 * the returned token to /api/devices/[id] (the column already exists).
 *
 * Errors are contained: registration failing must never break the web app —
 * every path catches and logs at debug level only.
 */
import { useEffect, useRef } from "react";
import { useIsNative } from "@/lib/mobile/use-is-native";
import { appVersionSetterRef } from "./AppVersionProvider";

const STORAGE_KEY = "device_registration"; // JSON {deviceId, token}

interface VersionPolicy {
  minBuild: number | null;
  latestBuild: number | null;
  softMessage: string | null;
}

async function primePushRegistration(): Promise<void> {
  // Intentionally empty — see the PUSH note in the header comment.
}

function parseBuild(build: string | undefined): number | null {
  if (!build) return null;
  const n = Number.parseInt(build, 10);
  return Number.isFinite(n) ? n : null;
}

export function MobileDeviceRegistrar() {
  const isNative = useIsNative();
  const hasRun = useRef(false);

  useEffect(() => {
    if (!isNative || hasRun.current) return;
    hasRun.current = true;

    const cap = window.Capacitor;
    const prefs = cap?.Plugins?.Preferences;

    void cap?.Plugins?.SplashScreen?.hide().catch(() => {});

    void (async () => {
      try {
        const platform = cap?.getPlatform?.() ?? null;
        if (platform !== "ios" && platform !== "android") return;

        let nativeBuild: number | null = null;
        let nativeVersion: string | null = null;
        try {
          const info = await cap?.Plugins?.App?.getInfo();
          nativeBuild = parseBuild(info?.build);
          nativeVersion = info?.version ?? null;
        } catch {
          // nativeBuild stays null → version gate fails open (path 3).
        }

        // ---- reuse path -------------------------------------------------
        let stored: { deviceId: string; token: string } | null = null;
        try {
          const raw = (await prefs?.get({ key: STORAGE_KEY }))?.value ?? null;
          stored = raw ? (JSON.parse(raw) as { deviceId: string; token: string }) : null;
        } catch {
          stored = null;
        }

        let policy: VersionPolicy | null = null;
        if (stored) {
          const res = await fetch(`/api/devices/${stored.deviceId}`, {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${stored.token}`,
            },
            body: JSON.stringify({ appVersion: nativeVersion ?? undefined }),
          });
          if (res.status === 401) {
            // Revoked or superseded — clear and let the next launch re-mint.
            await prefs?.remove({ key: STORAGE_KEY }).catch(() => {});
            stored = null;
          } else if (res.ok) {
            const policyRes = await fetch("/api/app-release");
            if (policyRes.ok) policy = (await policyRes.json()) as VersionPolicy;
          }
        }

        // ---- mint path --------------------------------------------------
        if (!stored) {
          const res = await fetch("/api/devices", {
            method: "POST",
            credentials: "include", // the WebView's session cookie
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              platform,
              appVersion: nativeVersion ?? undefined,
            }),
          });
          if (!res.ok) return; // signed-out WebView etc. — try next launch
          const data = (await res.json()) as {
            deviceId: string;
            token: string;
            versionPolicy: VersionPolicy;
          };
          policy = data.versionPolicy;
          await prefs
            ?.set({
              key: STORAGE_KEY,
              value: JSON.stringify({ deviceId: data.deviceId, token: data.token }),
            })
            .catch(() => {});
          await primePushRegistration();
        }

        if (policy) {
          appVersionSetterRef.current?.({
            nativeBuild,
            latestBuild: policy.latestBuild,
            minBuild: policy.minBuild,
            platform,
          });
        }
      } catch (err) {
        // Never let native bootstrap break the web app.
        if (process.env.NODE_ENV !== "production") {
          console.debug("[mobile] device registration skipped:", err);
        }
      }
    })();
  }, [isNative]);

  return null;
}
