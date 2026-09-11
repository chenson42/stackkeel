/**
 * Device bearer-token storage (module `mobile`) — expo-secure-store
 * (iOS Keychain / Android Keystore-encrypted). The token is the app's ONLY
 * credential; it is minted once by POST /api/devices and revocable
 * server-side. Alongside it we keep the server's device row id (needed for
 * PATCH /api/devices/[id]).
 */
import * as SecureStore from "expo-secure-store";

const TOKEN_KEY = "device_token";
const DEVICE_ID_KEY = "device_id";

export async function readDeviceToken(): Promise<string | null> {
  return SecureStore.getItemAsync(TOKEN_KEY);
}

export async function readDeviceId(): Promise<string | null> {
  return SecureStore.getItemAsync(DEVICE_ID_KEY);
}

export async function saveDeviceRegistration(deviceId: string, token: string): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_KEY, token);
  await SecureStore.setItemAsync(DEVICE_ID_KEY, deviceId);
}

export async function clearDeviceRegistration(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
  await SecureStore.deleteItemAsync(DEVICE_ID_KEY);
}
