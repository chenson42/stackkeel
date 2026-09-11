# Shell — Capacitor thin wrapper

A native iOS + Android app that loads the **deployed portal** in a WebView.
The product UI is the portal; this app exists for what a browser cannot do
(native splash, deep links, future push/native sign-in). Do not build UI here.

## One-time setup

The `ios/` and `android/` projects are **generated and committed**. If you
ever need to regenerate them (they are disposable):

```bash
rm -rf ios android && pnpm --filter shell cap:add
```

## Build & run

```bash
export SHELL_PORTAL_URL=https://your-portal.example.com   # or a preview URL
pnpm --filter shell cap:sync
pnpm --filter shell cap:open:ios       # opens Xcode
pnpm --filter shell cap:open:android   # opens Android Studio
```

Without `SHELL_PORTAL_URL` the shell serves `public/index.html` — a committed
offline stub, not the app.

## Native capabilities & extension points

- **Splash:** `@capacitor/splash-screen`, auto-hide backstop configured in
  `capacitor.config.ts`; the portal's `MobileDeviceRegistrar` hides it early.
- **Device registration:** happens in the portal web bridge (the WebView's
  session cookie hits `POST /api/devices`); the token is stored via
  `@capacitor/preferences`. Move it to a Keychain plugin if your fork's
  threat model wants at-rest protection.
- **Deep links:** `@capacitor/app`'s `appUrlOpen` is consumed by the
  portal's `MobileDeepLinkHandler`. Add your scheme to the iOS
  `Info.plist`/Android manifest when you personalize (the kit ships the
  placeholder `stackkeel` scheme in `capacitor.config.ts`).
- **Push:** not wired. Add `@capacitor/push-notifications`, implement
  `primePushRegistration()` in the portal bridge, and PATCH the token to
  `/api/devices/[id]` (the server column already exists).
- **Native Google Sign-In:** the backend already accepts native Google ID
  tokens (`google-native` provider in `@repo/auth`). Google blocks OAuth in
  embedded WebViews, so a shell that offers Google sign-in needs a native
  sign-in plugin that returns an ID token with `aud` = the WEB client id
  (pass your web client id as `serverClientId`), then posts it to the
  `google-native` credentials flow.

## Identity placeholders

`appId: com.example.stackkeel`, `appName: Stackkeel`, and the `stackkeel`
scheme are placeholders rewritten by the personalize skill. After
personalization, regenerate or hand-edit the native projects' bundle ids to
match (Xcode: Signing & Capabilities; Android: `applicationId` in
`android/app/build.gradle`).

## Verification

`BUILD SUCCEEDED` from Xcode/Gradle plus a `devices` table row after signing
in inside the shell is real verification. See
`.claude/agents/mobile-developer.md` for the command-line device workflow.
