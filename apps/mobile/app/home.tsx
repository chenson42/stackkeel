import { useCallback, useEffect, useState } from "react";
import { Link } from "expo-router";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { apiGet, apiPost } from "@/lib/api-client";
import { drainQueue } from "@/lib/offline-queue";
import { colors, radii, spacing, typography } from "@repo/tokens";

interface Me {
  id: string;
  name: string | null;
  email: string | null;
}
interface Health {
  ok: boolean;
  version?: string;
}

/**
 * Home (module `mobile`): proves the device token end-to-end — /api/me
 * (bearer-authenticated) + /api/health (public) — and demonstrates the
 * fork's extension point: replace this screen's content with your product,
 * keeping the load/error shape. Each focusless mount also heartbeats and
 * drains the offline queue (invariant: the backend is the store of record).
 */
export default function HomeScreen() {
  const [me, setMe] = useState<Me | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    // No synchronous setState here — every state write happens after the
    // awaits (react-hooks lint: sync setState in an effect cascades renders).
    const [meRes, healthRes] = await Promise.all([
      apiGet<Me>("/api/me"),
      apiGet<Health>("/api/health"),
      apiPost("/api/devices/heartbeat", {}),
      drainQueue(),
    ]);
    if (meRes.ok) {
      setMe(meRes.data);
      setError(null);
    } else if (meRes.reason !== "device_revoked") {
      setError(
        meRes.reason === "network_error"
          ? "Can't reach the server. Pull to retry."
          : "Couldn't load your account. Pull to retry.",
      );
    }
    if (healthRes.ok) setHealth(healthRes.data);
  }, []);

  useEffect(() => {
    // Every setState inside load() happens strictly after an await; the rule
    // cannot see through the async boundary. Nothing sets state synchronously.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            void load().finally(() => setRefreshing(false));
          }}
        />
      }
    >
      <View style={styles.card}>
        <Text style={styles.cardLabel}>Signed in as</Text>
        <Text style={styles.cardValue}>{me?.name ?? me?.email ?? "Loading…"}</Text>
        {me?.name && me.email ? <Text style={styles.cardSub}>{me.email}</Text> : null}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardLabel}>Server</Text>
        <Text style={styles.cardValue}>
          {health ? (health.ok ? "Healthy" : "Degraded") : "Checking…"}
        </Text>
        {health?.version ? <Text style={styles.cardSub}>v{health.version}</Text> : null}
      </View>

      {error && (
        <Text style={styles.error} accessibilityRole="alert">
          {error}
        </Text>
      )}

      <Link href="/settings" asChild>
        <Pressable style={styles.linkButton} accessibilityRole="button">
          <Text style={styles.linkText}>Settings</Text>
        </Pressable>
      </Link>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing[6], gap: spacing[4] },
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    padding: spacing[4],
    gap: spacing[1],
  },
  cardLabel: { fontSize: typography.xs, color: colors.mutedFg, textTransform: "uppercase" },
  cardValue: { fontSize: typography.lg, fontWeight: "600", color: colors.foreground },
  cardSub: { fontSize: typography.sm, color: colors.mutedFg },
  error: { color: colors.destructive, fontSize: typography.sm },
  linkButton: {
    borderRadius: radii.md,
    padding: spacing[4],
    alignItems: "center",
    backgroundColor: colors.muted,
    minHeight: 48,
    justifyContent: "center",
  },
  linkText: { fontWeight: "600", color: colors.foreground, fontSize: typography.base },
});
