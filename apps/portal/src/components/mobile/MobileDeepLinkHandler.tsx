"use client";

/**
 * MobileDeepLinkHandler — routes Capacitor `appUrlOpen` events (custom
 * scheme + universal links) into the Next router (module `mobile`). Renders
 * nothing; no-ops in a plain browser. Translation logic is pure and tested
 * in deep-link.ts.
 *
 * Scheme comes from NEXT_PUBLIC_APP_SCHEME (default "stackkeel" — the
 * personalize skill rewrites it alongside the shell's appId).
 */
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useIsNative } from "@/lib/mobile/use-is-native";
import { deepLinkToPath } from "./deep-link";

const APP_SCHEME = process.env.NEXT_PUBLIC_APP_SCHEME ?? "stackkeel";

export function MobileDeepLinkHandler() {
  const isNative = useIsNative();
  const router = useRouter();

  useEffect(() => {
    if (!isNative) return;
    const app = window.Capacitor?.Plugins?.App;
    if (!app) return;

    let removed = false;
    let remove: (() => void | Promise<void>) | null = null;

    void (async () => {
      const handle = await app.addListener("appUrlOpen", ({ url }) => {
        const path = deepLinkToPath(
          url,
          APP_SCHEME,
          typeof window !== "undefined" ? window.location.origin : null,
        );
        if (path) router.push(path);
      });
      if (removed) void handle.remove();
      else remove = () => handle.remove();
    })();

    return () => {
      removed = true;
      void remove?.();
    };
  }, [isNative, router]);

  return null;
}
