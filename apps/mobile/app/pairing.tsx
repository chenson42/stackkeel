import { useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { router } from "expo-router";
import { apiPost } from "@/lib/api-client";
import { saveDeviceRegistration } from "@/lib/device-token";
import { colors, spacing, radii, typography } from "@repo/tokens";

/**
 * Pairing screen (module `mobile`): the user mints a 6-digit code at the
 * portal's /account/devices and types it here. The exchange returns the
 * device bearer token exactly once; it goes straight into the secure store.
 */
const REASON_COPY: Record<string, string> = {
  invalid_code: "That code didn't work. Codes expire after 10 minutes — generate a fresh one and try again.",
  rate_limited: "Too many attempts. Wait a few minutes, then try again.",
  network_error: "Can't reach the server. Check your connection and try again.",
};

export default function PairingScreen() {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const digits = code.replace(/\D/g, "");
  const canSubmit = digits.length === 6 && !busy;

  async function submit() {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    const result = await apiPost<{ deviceId: string; token: string }>(
      "/api/devices",
      {
        platform: Platform.OS === "ios" ? "ios" : "android",
        pairingCode: digits,
        name: `${Platform.OS === "ios" ? "iPhone/iPad" : "Android"} (mobile app)`,
      },
      { unauthenticated: true },
    );
    if (result.ok) {
      await saveDeviceRegistration(result.data.deviceId, result.data.token);
      router.replace("/home");
    } else {
      setError(REASON_COPY[result.reason] ?? "Something went wrong. Try again.");
      setBusy(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Enter your pairing code</Text>
      <Text style={styles.body}>
        On the web, open Account → Devices and choose “Generate pairing code”,
        then enter the 6 digits here.
      </Text>
      <TextInput
        style={styles.input}
        value={code}
        onChangeText={(v) => setCode(v.replace(/[^\d\s]/g, "").slice(0, 7))}
        keyboardType="number-pad"
        placeholder="123 456"
        maxLength={7}
        autoFocus
        accessibilityLabel="Pairing code"
      />
      {error && (
        <Text style={styles.error} accessibilityRole="alert">
          {error}
        </Text>
      )}
      <Pressable
        style={[styles.button, !canSubmit && styles.buttonDisabled]}
        onPress={submit}
        disabled={!canSubmit}
        accessibilityRole="button"
      >
        {busy ? (
          <ActivityIndicator color="#ffffff" />
        ) : (
          <Text style={styles.buttonText}>Pair device</Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: spacing[6], gap: spacing[4] },
  heading: { fontSize: typography.xl, fontWeight: "600", color: colors.foreground },
  body: { fontSize: typography.sm, color: colors.mutedFg, lineHeight: 20 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    padding: spacing[4],
    fontSize: typography["2xl"],
    letterSpacing: 8,
    textAlign: "center",
    fontVariant: ["tabular-nums"],
  },
  error: { color: colors.destructive, fontSize: typography.sm },
  button: {
    backgroundColor: colors.brand[500],
    borderRadius: radii.md,
    padding: spacing[4],
    alignItems: "center",
    minHeight: 48,
    justifyContent: "center",
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: "#ffffff", fontWeight: "600", fontSize: typography.base },
});
