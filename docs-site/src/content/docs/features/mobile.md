---
title: "Mobile Apps: Capacitor Shell, Expo App, and Device Auth"
description: "Stackkeel's two mobile paths: a Capacitor shell that wraps your deployed Next.js portal for the app stores, and an Expo React Native app with device pairing, secure token storage, and an offline queue. Both authenticate with revocable device tokens."
---

Stackkeel ships two ways to be on a phone, because teams need different levels of
native investment at different times. Keep both, either, or neither; the
personalizer strips what you skip.

## The shell: your portal in the stores

`apps/shell` is a Capacitor 8 thin shell for iOS and Android that loads your
deployed portal. There is no second codebase to maintain: ship a web change and the
app has it. The kit generates both native projects, and the portal carries the
web-side bridge the shell needs:

- hydration-safe native detection (`useIsNative()`)
- device registration on first launch, with token reuse and self-healing on 401
- deep-link handling on your app scheme, plus Universal Links (`apple-app-site-association`)
  and Android App Links (`assetlinks.json`) served from well-known routes
- a WebView scroll-lock recovery guard for iOS

## Version gating

The `app_release_policy` table (edited at `/app-release` in the admin app) declares
a minimum and latest native version. Outdated builds see a soft update banner, and
builds below the minimum are blocked with a store link. The gate fails open in five
documented ways: a network hiccup can never lock users out of a working app.

## The Expo app: full native control

`apps/mobile` is an Expo app using expo-router, for products that outgrow a
WebView. It starts honest and small: a pairing screen, an authenticated home
screen, and settings. The interesting part is the plumbing, which is the part that
takes weeks to get right:

- **Device pairing.** A signed-in user mints a six-digit code in the portal (ten
  minute expiry, single use); the app exchanges it for a device token.
- **Token hygiene.** Tokens are opaque 32-byte values stored in the platform
  secure store; the server keeps only a SHA-256 hash. Users revoke devices from
  their account page, admins from `/devices`, and a revoked device is signed out
  on its next request.
- **Typed API client** with structured error reasons and idempotency keys, and an
  **offline queue** that persists writes, replays them with backoff on reconnect,
  and poisons a request after eight failures rather than retrying forever.

## One rule holds it together

Mobile clients are thin (Invariant 14). The portal's API is the single source of
business logic; the shell and the Expo app authenticate and render. Bearer tokens
are accepted by exactly three endpoints, so the device-auth surface stays auditable.
