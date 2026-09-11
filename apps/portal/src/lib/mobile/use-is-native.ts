"use client";
/**
 * useIsNative — hydration-safe hook: true only inside the Capacitor native
 * WebView (module `mobile`).
 *
 * useSyncExternalStore keeps the server snapshot (always false) and the
 * first client render in agreement, avoiding a setState-in-effect repaint.
 * subscribe is a no-op because isNativePlatform() is stable for the life of
 * the page. This is the ONE shared implementation — do not inline the
 * pattern in components.
 */
import { useSyncExternalStore } from "react";

const subscribe = () => () => {};
const getSnapshot = () =>
  typeof window !== "undefined" && window.Capacitor?.isNativePlatform?.() === true;
const getServerSnapshot = () => false;

export function useIsNative(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
