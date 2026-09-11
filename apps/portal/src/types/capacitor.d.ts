/**
 * Minimal ambient typing for the Capacitor global bridge (module `mobile`).
 * The portal never imports @capacitor/* packages — in the browser the global
 * is simply absent and every bridge component no-ops. Only the members the
 * bridge components actually touch are declared.
 */
interface CapacitorSplashScreenPlugin {
  hide: () => Promise<void>;
}

interface CapacitorAppPlugin {
  getInfo: () => Promise<{ version: string; build: string }>;
  addListener: (
    event: "appUrlOpen",
    handler: (data: { url: string }) => void,
  ) => Promise<{ remove: () => Promise<void> }> | { remove: () => void };
}

interface CapacitorPreferencesPlugin {
  get: (options: { key: string }) => Promise<{ value: string | null }>;
  set: (options: { key: string; value: string }) => Promise<void>;
  remove: (options: { key: string }) => Promise<void>;
}

interface CapacitorGlobal {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
  Plugins?: {
    SplashScreen?: CapacitorSplashScreenPlugin;
    App?: CapacitorAppPlugin;
    Preferences?: CapacitorPreferencesPlugin;
  };
}

interface Window {
  Capacitor?: CapacitorGlobal;
}
