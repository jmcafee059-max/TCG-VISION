import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  RefreshControl,
  ActivityIndicator,
} from "react-native";
import { useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius, spacing } from "@/src/theme";
import { CardInfo, clearHistory, fetchHistory } from "@/src/lib/api";

function formatUSD(v: number | null | undefined) {
  if (v == null || isNaN(v)) return "—";
  return `$${v.toFixed(2)}`;
}

function formatDate(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleString();
  } catch {
    return iso;
  }
}

export default function HistoryScreen() {
  const [items, setItems] = useState<CardInfo[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await fetchHistory();
      setItems(data);
    } catch {
      setItems([]);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const onClear = async () => {
    await clearHistory();
    setItems([]);
  };

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <View style={styles.header}>
        <View>
          <Text style={styles.hTitle}>HISTORY</Text>
          <Text style={styles.hSub}>Recently scanned cards</Text>
        </View>
        {items && items.length > 0 ? (
          <Pressable testID="clear-history-btn" onPress={onClear} style={styles.clearBtn}>
            <Ionicons name="trash-outline" size={16} color={colors.error} />
            <Text style={styles.clearText}>CLEAR</Text>
          </Pressable>
        ) : null}
      </View>
      {items === null ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.brand} />
        </View>
      ) : items.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="albums-outline" size={44} color={colors.onSurfaceTertiary} />
          <Text style={styles.emptyTitle}>No cards scanned yet</Text>
          <Text style={styles.emptySub}>Head to Scanner and point the camera at a card.</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(i) => i.id}
          testID="history-list"
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.brand}
            />
          }
          contentContainerStyle={{ paddingBottom: 120 }}
          ItemSeparatorComponent={() => <View style={styles.sep} />}
          renderItem={({ item }) => (
            <View style={styles.row} testID={`history-item-${item.id}`}>
              {item.image_url ? (
                <Image source={{ uri: item.image_url }} style={styles.thumb} contentFit="cover" />
              ) : (
                <View style={[styles.thumb, styles.thumbEmpty]}>
                  <Ionicons name="card-outline" size={20} color={colors.onSurfaceTertiary} />
                </View>
              )}
              <View style={styles.rowMid}>
                <Text style={styles.rowName} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={styles.rowMeta} numberOfLines={1}>
                  {[item.set_name, item.number].filter(Boolean).join(" · ") || "Unknown set"}
                </Text>
                <Text style={styles.rowDate}>{formatDate(item.scanned_at)}</Text>
              </View>
              <View style={styles.rowRight}>
                <Text style={styles.rowPrice}>
                  {formatUSD(item.price?.market ?? item.price?.mid)}
                </Text>
                {item.rarity ? <Text style={styles.rowRarity}>{item.rarity}</Text> : null}
              </View>
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  hTitle: {
    color: colors.onSurface,
    fontSize: 26,
    fontWeight: "900",
    letterSpacing: 1,
  },
  hSub: { color: colors.onSurfaceSecondary, fontSize: 12, marginTop: 2 },
  clearBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  clearText: { color: colors.error, fontSize: 11, fontWeight: "700", letterSpacing: 0.8 },

  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl },
  emptyTitle: {
    color: colors.onSurface,
    fontSize: 16,
    fontWeight: "700",
    marginTop: spacing.md,
  },
  emptySub: {
    color: colors.onSurfaceSecondary,
    fontSize: 13,
    textAlign: "center",
    marginTop: 6,
  },

  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  sep: { height: 1, backgroundColor: colors.divider, marginHorizontal: spacing.lg },
  thumb: {
    width: 44,
    height: 62,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceTertiary,
  },
  thumbEmpty: { alignItems: "center", justifyContent: "center" },
  rowMid: { flex: 1, marginLeft: spacing.md },
  rowName: { color: colors.onSurface, fontSize: 15, fontWeight: "700" },
  rowMeta: { color: colors.onSurfaceSecondary, fontSize: 12, marginTop: 2 },
  rowDate: { color: colors.onSurfaceTertiary, fontSize: 10, marginTop: 2 },
  rowRight: { alignItems: "flex-end" },
  rowPrice: { color: colors.brand, fontSize: 16, fontWeight: "800" },
  rowRarity: { color: colors.onSurfaceTertiary, fontSize: 10, marginTop: 4 },
});
