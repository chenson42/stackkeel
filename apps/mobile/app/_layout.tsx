import { useEffect } from "react";
import { Stack, router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { onRevoked } from "@/lib/revocation-bus";
import { clearDeviceRegistration } from "@/lib/device-token";
import { colors } from "@repo/tokens";

/**
 * Root layout (module `mobile`). Subscribes to the revocation bus: any API
 * call answered with 401 device_revoked clears local state and returns to
 * pairing — the server is the authority on device liveness.
 */
export default function RootLayout() {
  useEffect(
    () =>
      onRevoked(() => {
        void clearDeviceRegistration().finally(() => router.replace("/pairing"));
      }),
    [],
  );

  return (
    <>
      <StatusBar style="auto" />
      <Stack
        screenOptions={{
          headerTintColor: colors.brand[700],
          headerTitleStyle: { fontWeight: "600" },
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="pairing" options={{ title: "Pair this device" }} />
        <Stack.Screen name="home" options={{ title: "Home", headerBackVisible: false }} />
        <Stack.Screen name="settings" options={{ title: "Settings" }} />
      </Stack>
    </>
  );
}
