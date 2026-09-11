"use client";

import { useEffect, useRef } from "react";
import Script from "next/script";

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
const SCRIPT_SRC =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: Record<string, unknown>) => string;
      remove: (id: string) => void;
    };
  }
}

interface TurnstileProps {
  onVerify: (token: string) => void;
  onExpire?: () => void;
  onError?: () => void;
  className?: string;
}

/**
 * Cloudflare Turnstile widget. Renders null when NEXT_PUBLIC_TURNSTILE_SITE_KEY
 * is unset — the starter default. Forms work unchanged with no keys configured.
 *
 * Ported from fertilityluna/src/components/marketing/turnstile.tsx with:
 * - next/script for script loading (lazyOnload strategy)
 * - widgetIdRef for explicit cleanup and StrictMode double-render safety
 * - onVerify/onExpire/onError prop names per Phase 3 spec
 */
export function Turnstile({
  onVerify,
  onExpire,
  onError,
  className,
}: TurnstileProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);

  // Stable refs so render callbacks always call the latest prop values
  // without needing to re-register the widget on prop changes.
  const onVerifyRef = useRef(onVerify);
  const onExpireRef = useRef(onExpire);
  const onErrorRef = useRef(onError);

  // Keep refs in sync with the latest props via effect (avoids setting
  // ref.current during render, which ESLint's react-hooks/refs rule disallows).
  useEffect(() => {
    onVerifyRef.current = onVerify;
    onExpireRef.current = onExpire;
    onErrorRef.current = onError;
  }, [onVerify, onExpire, onError]);

  function renderWidget() {
    // StrictMode guard: only render once per mount.
    if (!window.turnstile || !containerRef.current || widgetIdRef.current) return;
    widgetIdRef.current = window.turnstile.render(containerRef.current, {
      sitekey: SITE_KEY,
      callback: (token: string) => onVerifyRef.current(token),
      "expired-callback": () => {
        onExpireRef.current?.();
        onVerifyRef.current(""); // blank token re-disables submit
      },
      "error-callback": () => {
        onErrorRef.current?.();
        onVerifyRef.current("");
      },
    });
  }

  useEffect(() => {
    if (!SITE_KEY) return;

    // Script may already be loaded (e.g. re-mount after navigation).
    if (window.turnstile) {
      renderWidget();
    }

    return () => {
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      }
    };
    // Empty deps: renderWidget, widgetIdRef, and containerRef are all stable
    // across renders; this effect runs exactly once per mount.
  }, []);

  if (!SITE_KEY) return null;

  return (
    <>
      <Script src={SCRIPT_SRC} strategy="lazyOnload" onLoad={renderWidget} />
      <div ref={containerRef} className={className} />
    </>
  );
}
