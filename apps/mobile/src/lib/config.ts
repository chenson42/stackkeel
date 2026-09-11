/**
 * API base URL — the deployed portal (module `mobile`).
 * EXPO_PUBLIC_* vars are inlined at bundle time and are PUBLIC. Local dev
 * against a simulator: EXPO_PUBLIC_API_URL=http://localhost:3000 (Android
 * emulator uses http://10.0.2.2:3000).
 */
export const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";
