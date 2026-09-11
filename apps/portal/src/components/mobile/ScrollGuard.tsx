"use client";

/**
 * ScrollGuard — WebView scroll-lock recovery (module `mobile`).
 *
 * In the iOS/Android WebView, Radix overlays' scroll lock (body
 * overflow/position juggling via react-remove-scroll) can strand the page
 * unscrollable when the WebView suspends mid-animation (backgrounding the
 * app while a sheet is closing is the reproducible case). The lock's cleanup
 * never runs, and unlike a browser tab, the user cannot "refresh the page".
 *
 * Recovery: on visibilitychange→visible (the exact moment the stranding is
 * observable), if the body carries a scroll lock but NO overlay is actually
 * open ([data-state="open"] on a Radix portal), clear the inline lock
 * styles. A REAL open overlay is never touched. No-ops in a plain browser
 * (also harmless there). Renders nothing.
 */
import { useEffect } from "react";
import { useIsNative } from "@/lib/mobile/use-is-native";

function clearStrandedLock() {
  const body = document.body;
  const locked =
    body.style.overflow === "hidden" ||
    body.style.position === "fixed" ||
    body.hasAttribute("data-scroll-locked");
  if (!locked) return;

  const openOverlay = document.querySelector(
    '[data-state="open"][role="dialog"], [data-state="open"][data-radix-popper-content-wrapper]',
  );
  if (openOverlay) return;

  body.style.overflow = "";
  body.style.position = "";
  body.style.top = "";
  body.style.left = "";
  body.style.right = "";
  body.removeAttribute("data-scroll-locked");
}

export function ScrollGuard() {
  const isNative = useIsNative();

  useEffect(() => {
    if (!isNative) return;
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        // Give any in-flight Radix close animation a beat to finish its own
        // cleanup first; only then treat a remaining lock as stranded.
        window.setTimeout(clearStrandedLock, 350);
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [isNative]);

  return null;
}
