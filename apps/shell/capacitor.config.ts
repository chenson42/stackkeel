/**
 * Capacitor shell configuration (module `mobile`).
 *
 * THE THIN-SHELL BET: the product UI is the deployed portal; this app is a
 * WebView pointed at it plus the native capabilities a browser lacks. Do not
 * rebuild UI here.
 *
 * server.url strategy:
 *   - Set SHELL_PORTAL_URL in your shell environment before running any
 *     `cap` command (sync/build), e.g.
 *       export SHELL_PORTAL_URL=https://your-portal.example.com
 *     Point it at a preview deployment while developing a branch.
 *   - If unset, Capacitor serves ./public locally — a committed offline stub
 *     page, NOT the app. That is a safety net so the CLI runs, never the
 *     intended path.
 *   - NEVER commit a live URL here; the env var is the only source.
 *
 * appId/appName are PLACEHOLDERS — the personalize skill rewrites them
 * (registered in scripts/kit/identity-files.json) together with
 * NEXT_PUBLIC_APP_SCHEME on the portal side.
 */
import type { CapacitorConfig } from "@capacitor/cli";

const serverUrl = process.env.SHELL_PORTAL_URL;

const config: CapacitorConfig = {
  appId: "com.example.stackkeel",
  appName: "Stackkeel",

  // Served only when SHELL_PORTAL_URL is unset (see header). Must exist for
  // the CLI to run.
  webDir: "public",

  server: serverUrl
    ? {
        url: serverUrl,
        // HTTPS only — never allow cleartext portals.
        cleartext: false,
      }
    : undefined,

  plugins: {
    SplashScreen: {
      // launchAutoHide: true is REQUIRED for launchShowDuration to act as a
      // backstop. With launchAutoHide:false Capacitor IGNORES the duration:
      // the splash waits for a JS hide() call, and any hiccup before the
      // portal's MobileDeviceRegistrar mounts leaves it stuck (a >30s hang
      // in an ancestor). With true, native always clears the splash after
      // launchShowDuration, and the registrar's hide() clears it earlier on
      // a warm load. No infinite-splash trap either way.
      launchAutoHide: true,
      launchShowDuration: 3000,
      showSpinner: false,
    },
  },

  ios: {
    scrollEnabled: true,
    contentInset: "automatic",
    // Scheme for local-asset mode (SHELL_PORTAL_URL unset) only.
    scheme: "stackkeel",
  },
};

export default config;
