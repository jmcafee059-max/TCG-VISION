import React, { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  RefreshControl,
  ActivityIndicator,
  Dimensions,
  FlatList,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius, spacing } from "@/src/theme";
import {
  CollectionItem,
  CollectionSummary,
  getCollection,
  removeFromCollection,
} from "@/src/lib/api";
import CardDetailSheet, { DetailCard } from "@/src/components/CardDetailSheet";

const { width } = Dimensions.get("window");

function formatUSD(v: number | null | undefined) {
  if (v == null || isNaN(v)) return "—";
  return `$${v.toFixed(2)}`;
}

// -------- Binder page (3x3) --------
function BinderPage({
  cards,
  pageIndex,
  slotsPerPage,
  onRemove,
  onOpen,
}: {
  cards: CollectionItem[];
  pageIndex: number;
  slotsPerPage: number;
  onRemove: (id: string) => void;
  onOpen: (c: CollectionItem) => void;
}) {
  const cellWidth = (width - spacing.lg * 2 - 12 * 2 - 6 * 2) / 3;
  const cellHeight = cellWidth * 1.4;

  return (
    <View style={pageStyles.page}>
      <View style={pageStyles.pageHeader}>
        <Text style={pageStyles.pageLabel}>PAGE {pageIndex + 1}</Text>
      </View>
      <View style={pageStyles.grid}>
        {Array.from({ length: slotsPerPage }).map((_, i) => {
          const c = cards[i];
          if (!c) {
            return (
              <View
                key={`empty-${i}`}
                style={[pageStyles.slot, pageStyles.slotEmpty, { width: cellWidth, height: cellHeight }]}
              >
                <Ionicons name="add" size={20} color={colors.onSurfaceTertiary} />
              </View>
            );
          }
          return (
            <Pressable
              key={c.id}
              testID={`binder-slot-${c.id}`}
              onPress={() => onOpen(c)}
              onLongPress={() => onRemove(c.id)}
              style={[pageStyles.slot, { width: cellWidth, height: cellHeight }]}
            >
              {c.image_url ? (
                <Image source={{ uri: c.image_url }} style={pageStyles.slotImg} contentFit="cover" />
              ) : (
                <View style={[pageStyles.slotImg, pageStyles.slotImgEmpty]}>
                  <Ionicons name="card-outline" size={18} color={colors.onSurfaceTertiary} />
                  <Text style={pageStyles.slotName} numberOfLines={1}>
                    {c.name}
                  </Text>
                </View>
              )}
              {c.price_market != null ? (
                <View style={pageStyles.slotPricePill}>
                  <Text style={pageStyles.slotPriceText}>{formatUSD(c.price_market)}</Text>
                </View>
              ) : null}
              {c.number ? (
                <View style={pageStyles.slotNumPill}>
                  <Text style={pageStyles.slotNumText}>{c.number}</Text>
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

// -------- Set folder (expandable, 3x3 binder pages) --------
function SetFolder({
  setName,
  items,
  totalValue,
  onRemove,
  onOpen,
}: {
  setName: string;
  items: CollectionItem[];
  totalValue: number;
  onRemove: (id: string) => void;
  onOpen: (c: CollectionItem) => void;
}) {
  const [open, setOpen] = useState(false);
  const slotsPerPage = 9;

  // Build binder pages: use the card's number_int (1-based). If unknown, append at end.
  const pages = useMemo(() => {
    // Determine set size — max between total_in_set and max number_int in this collection
    const maxKnown = items.reduce(
      (m, it) => Math.max(m, it.number_int || 0, it.total_in_set || 0),
      0,
    );
    const totalSlots = Math.max(maxKnown, slotsPerPage);
    const numPages = Math.ceil(totalSlots / slotsPerPage);
    const grid: (CollectionItem | null)[][] = Array.from({ length: numPages }, () =>
      Array(slotsPerPage).fill(null),
    );
    const overflow: CollectionItem[] = [];
    for (const it of items) {
      if (it.number_int && it.number_int >= 1) {
        const zero = it.number_int - 1;
        const page = Math.floor(zero / slotsPerPage);
        const slot = zero % slotsPerPage;
        if (page < grid.length) grid[page][slot] = it;
        else overflow.push(it);
      } else {
        overflow.push(it);
      }
    }
    // Add overflow into extra pages at the end
    let extraPage: (CollectionItem | null)[] = [];
    for (const it of overflow) {
      extraPage.push(it);
      if (extraPage.length === slotsPerPage) {
        grid.push([...extraPage]);
        extraPage = [];
      }
    }
    if (extraPage.length) {
      while (extraPage.length < slotsPerPage) extraPage.push(null);
      grid.push(extraPage);
    }
    return grid;
  }, [items]);

  return (
    <View style={folderStyles.wrap}>
      <Pressable
        testID={`set-folder-${setName}`}
        onPress={() => setOpen((o) => !o)}
        style={folderStyles.header}
      >
        <Ionicons
          name={open ? "folder-open" : "folder"}
          size={22}
          color={colors.brand}
        />
        <View style={folderStyles.headerText}>
          <Text style={folderStyles.name} numberOfLines={1}>
            {setName}
          </Text>
          <Text style={folderStyles.meta}>
            {items.length} card{items.length === 1 ? "" : "s"} · {formatUSD(totalValue)}
          </Text>
        </View>
        <Ionicons
          name={open ? "chevron-up" : "chevron-down"}
          size={18}
          color={colors.onSurfaceTertiary}
        />
      </Pressable>
      {open ? (
        <FlatList
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          data={pages}
          keyExtractor={(_, i) => `pg-${setName}-${i}`}
          renderItem={({ item, index }) => (
            <BinderPage
              cards={item as CollectionItem[]}
              pageIndex={index}
              slotsPerPage={9}
              onRemove={onRemove}
              onOpen={onOpen}
            />
          )}
          style={{ marginTop: spacing.md }}
        />
      ) : null}
    </View>
  );
}

// -------- Main screen --------
export default function CollectionScreen() {
  const insets = useSafeAreaInsets();
  const [data, setData] = useState<CollectionSummary | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [detail, setDetail] = useState<DetailCard | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await getCollection();
      setData(d);
    } catch {
      setData({ total_cards: 0, total_value: 0, by_set: [], all_by_price: [] });
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

  const onRemove = async (id: string) => {
    await removeFromCollection(id);
    load();
  };

  const openDetail = (c: CollectionItem) => {
    setDetail({
      id: c.id,
      name: c.name,
      set_name: c.set_name,
      number: c.number,
      rarity: c.rarity,
      language: c.language,
      image_url: c.image_url,
      price_market: c.price_market ?? undefined,
    });
    setDetailId(c.id);
  };

  const removeCurrentDetail = async () => {
    if (detailId) {
      await removeFromCollection(detailId);
      load();
    }
  };

  const priceGridCellSize = (width - spacing.lg * 2 - 6 * 2) / 3;

  return (
    <SafeAreaView style={styles.root} edges={["top"]} testID="collection-screen">
      <View style={styles.header}>
        <Text style={styles.hTitle}>COLLECTION</Text>
        <Text style={styles.hSub}>Your portfolio, binder-style</Text>
      </View>

      {data === null ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.brand} />
        </View>
      ) : data.total_cards === 0 ? (
        <View style={styles.center}>
          <Ionicons name="albums-outline" size={44} color={colors.onSurfaceTertiary} />
          <Text style={styles.emptyTitle}>No cards yet</Text>
          <Text style={styles.emptySub}>
            Scan a card and tap ADD TO COLLECTION to start your binder.
          </Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />
          }
        >
          {/* Total value hero */}
          <View style={styles.hero} testID="collection-total">
            <Text style={styles.heroLabel}>PORTFOLIO VALUE</Text>
            <Text style={styles.heroValue}>{formatUSD(data.total_value)}</Text>
            <View style={styles.heroChips}>
              <View style={styles.heroChip}>
                <Ionicons name="albums-outline" size={12} color={colors.onBrandTertiary} />
                <Text style={styles.heroChipText}>{data.total_cards} CARDS</Text>
              </View>
              <View style={styles.heroChip}>
                <Ionicons name="folder-outline" size={12} color={colors.onBrandTertiary} />
                <Text style={styles.heroChipText}>{data.by_set.length} SETS</Text>
              </View>
            </View>
          </View>

          {/* By price grid */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>TOP VALUE</Text>
            <View style={styles.priceGrid}>
              {data.all_by_price.slice(0, 12).map((c) => (
                <Pressable
                  key={c.id}
                  onPress={() => openDetail(c)}
                  style={[styles.priceCell, { width: priceGridCellSize, height: priceGridCellSize * 1.35 }]}
                  testID={`price-grid-${c.id}`}
                >
                  {c.image_url ? (
                    <Image source={{ uri: c.image_url }} style={styles.priceImg} contentFit="cover" />
                  ) : (
                    <View style={[styles.priceImg, styles.priceImgEmpty]}>
                      <Ionicons name="card-outline" size={20} color={colors.onSurfaceTertiary} />
                    </View>
                  )}
                  <View style={styles.pricePill}>
                    <Text style={styles.pricePillText}>{formatUSD(c.price_market)}</Text>
                  </View>
                </Pressable>
              ))}
            </View>
          </View>

          {/* Set folders */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>BINDER FOLDERS</Text>
            {data.by_set.map((g) => (
              <SetFolder
                key={g.set_name}
                setName={g.set_name}
                items={g.items}
                totalValue={g.total_value}
                onRemove={onRemove}
                onOpen={openDetail}
              />
            ))}
          </View>

          <Text style={styles.footerHint}>Tap a card to view details · long-press to remove.</Text>
        </ScrollView>
      )}
      <CardDetailSheet
        visible={!!detail}
        card={detail}
        onClose={() => setDetail(null)}
        onRemove={removeCurrentDetail}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  hTitle: { color: colors.onSurface, fontSize: 26, fontWeight: "900", letterSpacing: 1 },
  hSub: { color: colors.onSurfaceSecondary, fontSize: 12, marginTop: 2 },
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
    lineHeight: 18,
  },

  hero: {
    marginHorizontal: spacing.lg,
    padding: spacing.xl,
    backgroundColor: colors.brandTertiary,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.brandSecondary,
  },
  heroLabel: {
    color: colors.onBrandTertiary,
    fontSize: 11,
    letterSpacing: 1.5,
    fontWeight: "700",
  },
  heroValue: {
    color: colors.onSurface,
    fontSize: 44,
    fontWeight: "900",
    letterSpacing: -1,
    marginTop: 4,
  },
  heroChips: { flexDirection: "row", gap: 8, marginTop: spacing.md },
  heroChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(255,255,255,0.06)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.sm,
  },
  heroChipText: {
    color: colors.onBrandTertiary,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.8,
  },

  section: { marginTop: spacing.xl, paddingHorizontal: spacing.lg },
  sectionTitle: {
    color: colors.onSurfaceTertiary,
    fontSize: 11,
    letterSpacing: 1.5,
    fontWeight: "700",
    marginBottom: spacing.md,
  },
  priceGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  priceCell: {
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceSecondary,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.border,
  },
  priceImg: { flex: 1, width: "100%" },
  priceImgEmpty: { alignItems: "center", justifyContent: "center" },
  pricePill: {
    position: "absolute",
    bottom: 4,
    left: 4,
    right: 4,
    backgroundColor: "rgba(5,9,21,0.85)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.sm,
    alignItems: "center",
  },
  pricePillText: {
    color: colors.brand,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.3,
  },

  footerHint: {
    color: colors.onSurfaceTertiary,
    fontSize: 11,
    textAlign: "center",
    marginTop: spacing.xl,
    fontStyle: "italic",
  },
});

const folderStyles = StyleSheet.create({
  wrap: {
    marginBottom: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.md,
    gap: spacing.md,
  },
  headerText: { flex: 1 },
  name: {
    color: colors.onSurface,
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: 0.4,
  },
  meta: {
    color: colors.onSurfaceSecondary,
    fontSize: 11,
    marginTop: 2,
    letterSpacing: 0.3,
  },
});

const pageStyles = StyleSheet.create({
  page: {
    width: width - spacing.lg * 2,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
  },
  pageHeader: { alignItems: "center", paddingVertical: 6 },
  pageLabel: {
    color: colors.onSurfaceTertiary,
    fontSize: 10,
    letterSpacing: 1.5,
    fontWeight: "700",
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: 6,
  },
  slot: {
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    overflow: "hidden",
    marginBottom: 6,
  },
  slotEmpty: {
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
  },
  slotImg: { flex: 1, width: "100%" },
  slotImgEmpty: {
    alignItems: "center",
    justifyContent: "center",
    padding: 4,
  },
  slotName: {
    color: colors.onSurfaceSecondary,
    fontSize: 9,
    marginTop: 4,
    textAlign: "center",
  },
  slotPricePill: {
    position: "absolute",
    bottom: 3,
    left: 3,
    backgroundColor: "rgba(5,9,21,0.9)",
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 3,
  },
  slotPriceText: {
    color: colors.brand,
    fontSize: 9,
    fontWeight: "800",
  },
  slotNumPill: {
    position: "absolute",
    top: 3,
    right: 3,
    backgroundColor: "rgba(5,9,21,0.9)",
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 3,
  },
  slotNumText: {
    color: colors.onSurfaceSecondary,
    fontSize: 8,
    fontWeight: "700",
  },
});
