import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "@/src/theme";
import { StyleSheet, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function TabsLayout() {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  
  // Responsive sizing based on screen dimensions
  const isSmallScreen = width < 360;
  const isLargeScreen = width > 400;
  
  const tabBarHeight = isSmallScreen ? 70 : (isLargeScreen ? 95 : 88);
  const iconSize = isSmallScreen ? 22 : (isLargeScreen ? 28 : 24);
  const labelFontSize = isSmallScreen ? 9 : (isLargeScreen ? 11 : 10);
  const paddingTop = isSmallScreen ? 8 : (isLargeScreen ? 14 : 12);
  const paddingBottom = insets.bottom > 0 ? insets.bottom + 8 : (isSmallScreen ? 24 : 32);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          ...styles.tabBar,
          height: tabBarHeight + paddingBottom,
          paddingTop,
          paddingBottom,
        },
        tabBarActiveTintColor: colors.brand,
        tabBarInactiveTintColor: colors.onSurfaceTertiary,
        tabBarLabelStyle: { fontSize: labelFontSize, fontWeight: "600", letterSpacing: 0.4 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "SCANNER",
          tabBarIcon: ({ color }) => (
            <Ionicons name="scan-outline" size={iconSize} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="collection"
        options={{
          title: "COLLECTION",
          tabBarIcon: ({ color }) => (
            <Ionicons name="albums-outline" size={iconSize} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: "HISTORY",
          tabBarIcon: ({ color }) => (
            <Ionicons name="time-outline" size={iconSize} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "SETTINGS",
          tabBarIcon: ({ color }) => (
            <Ionicons name="settings-outline" size={iconSize} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: colors.surface,
    borderTopColor: colors.divider,
    borderTopWidth: 1,
    elevation: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
});
