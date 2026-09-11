"use client";

/**
 * AppVersionProvider — holds the native shell's version state (module
 * `mobile`). MobileDeviceRegistrar publishes into it after registration via
 * the module-level `appVersionSetterRef` (no prop drilling; the setter from
 * useState is identity-stable). AppVersionGate reads it and renders the
 * banner/block or nothing.
 */
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { VersionGateState } from "./version-gate-logic";

interface AppVersionContextValue {
  state: VersionGateState | null;
  updateCheckEnabled: boolean;
}

const AppVersionContext = createContext<AppVersionContextValue | null>(null);

/** Module singleton so the registrar can publish without prop drilling. */
export const appVersionSetterRef: { current: ((s: VersionGateState) => void) | null } = {
  current: null,
};

export function AppVersionProvider({
  updateCheckEnabled,
  children,
}: {
  updateCheckEnabled: boolean;
  children: ReactNode;
}) {
  const [state, setState] = useState<VersionGateState | null>(null);

  useEffect(() => {
    appVersionSetterRef.current = setState;
    return () => {
      appVersionSetterRef.current = null;
    };
  }, []);

  return (
    <AppVersionContext.Provider value={{ state, updateCheckEnabled }}>
      {children}
    </AppVersionContext.Provider>
  );
}

export function useAppVersionContext(): AppVersionContextValue | null {
  return useContext(AppVersionContext);
}
