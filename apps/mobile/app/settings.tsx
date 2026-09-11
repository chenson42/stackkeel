import { useEffect, useState } from "react";
import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Constants from "expo-constants";
import { clearDeviceRegistration, readDeviceId } from "@/lib/device-token";
import { API_BASE_URL } from "@/lib/config";
import { colors, radii, spacing, typography } from "@repo/tokens";

/**
 * Settings (module `mobile`). "Unpair" discards the LOCAL token only — the
 * server row stays until revoked from the web (/account/devices), which is
 * the actual security boundary. The copy says so plainly.
 */
export default function SettingsScreen() {
  const [deviceId, setDeviceId] = useState<string | null>(null);

  useEffect(() => {
    void readDeviceId().then(setDeviceId);
  }, []);

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Row label="App version" value={Constants.expoConfig?.version ?? "dev"} />
        <Row label="Server" value={API_BASE_URL} />
        <Row label="Device id" value={deviceId ? `${deviceId.slice(0, 8)}…` : "—"} />
      </View>

      <Pressable
        style={styles.dangerButton}
        accessibilityRole="button"
        onPress={() => {
          void clearDeviceRegistration().finally(() => router.replace("/pairing"));
        }}
      >
        <Text style={styles.dangerText}>Unpair this device</Text>
      </Pressable>
      <Text style={styles.note}>
        Unpairing signs this app out. To fully revoke the device&apos;s access,
        also remove it under Account → Devices on the web.
      </Text>
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: spacing[6], gap: spacing[4] },
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    paddingHorizontal: spacing[4],
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing[4],
    paddingVertical: spacing[3],
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rowLabel: { color: colors.mutedFg, fontSize: typography.sm },
  rowValue: { color: colors.foreground, fontSize: typography.sm, flexShrink: 1 },
  dangerButton: {
    borderWidth: 1,
    borderColor: colors.destructive,
    borderRadius: radii.md,
    padding: spacing[4],
    alignItems: "center",
    minHeight: 48,
    justifyContent: "center",
  },
  dangerText: { color: colors.destructive, fontWeight: "600", fontSize: typography.base },
  note: { color: colors.mutedFg, fontSize: typography.xs, lineHeight: 18 },
});
