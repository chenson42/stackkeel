import { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import { router } from "expo-router";
import { readDeviceToken } from "@/lib/device-token";
import { colors } from "@repo/tokens";

/** Entry: paired → /home, otherwise → /pairing. */
export default function Index() {
  useEffect(() => {
    void readDeviceToken().then((token) => {
      router.replace(token ? "/home" : "/pairing");
    });
  }, []);

  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
      <ActivityIndicator color={colors.brand[500]} />
    </View>
  );
}
