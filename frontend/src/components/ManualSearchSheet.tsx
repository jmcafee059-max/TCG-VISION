import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  TextInput,
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { BlurView } from "expo-blur";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius, spacing } from "@/src/theme";
import { searchCards, SearchResult, pickCandidate, CardInfo } from "@/src/lib/api";

function formatUSD(v: number | null | undefined) {
  if (v == null || isNaN(v) || v <= 0) return "—";
  if (v >= 1000) return `$${(v / 1000).toFixed(v >= 10000 ? 1 : 2)}k`;
  return `$${v.toFixed(2)}`;
}

type Props = {
  visible: boolean;
  onClose: () => void;
  onPick: (card: CardInfo) => void;
  language?: "english" | "japanese";
  initialQuery?: string;
};

export function ManualSearchSheet({
  visible,
  onClose,
  onPick,
  language = "english",
  initialQuery = "",
}: Props) {
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [picking, setPicking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<TextInput>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset state whenever the sheet is opened
  useEffect(() => {
    if (visible) {
      setQuery(initialQuery);
      setResults([]);
      setError(null);
      setPicking(null);
      // Autofocus after transition settles
      const t = setTimeout(() => inputRef.current?.focus(), 250);
      return () => clearTimeout(t);
    }
  }, [visible, initialQuery]);

  // Debounced search-as-you-type
  useEffect(() => {
    if (!visible) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const items = await searchCards(q, language);
        setResults(items);
        setError(items.length === 0 ? "No matches — try a different spelling." : null);
      } catch (e: any) {
        setError("Search failed. Check connection and try again.");
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 350);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, visible, language]);

  const handlePick = useCallback(
    async (r: SearchResult) => {
      const key = `${r.set_name}-${r.number}`;
      setPicking(key);
      try {
        const card = await pickCandidate({
          name: r.name,
          set_name: r.set_name || "",
          number: r.number || "",
          language,
        });
        onPick(card);
        onClose();
      } catch {
        setError("Couldn't lock that card. Try another.");
      } finally {
        setPicking(null);
      }
    },
    [language, onPick, onClose],
  );

  const renderItem = useCallback(
    ({ item, index }: { item: SearchResult; index: number }) => {
      const key = `${item.set_name}-${item.number}`;
      const isBusy = picking === key;
      return (
        <Pressable
          testID={`manual-search-result-${index}`}
          onPress={() => handlePick(item)}
          disabled={!!picking}
          style={({ pressed }) => [styles.resultRow, pressed && styles.resultRowPressed]}
        >
          <View style={styles.resultTextWrap}>
            <Text style={styles.resultName} numberOfLines={1}>
              {item.name}
            </Text>
            <Text style={styles.resultSet} numberOfLines={1}>
              {item.set_name || "Unknown set"}
              {item.number ? ` · #${item.number}` : ""}
              {item.rarity ? ` · ${item.rarity}` : ""}
            </Text>
          </View>
          <View style={styles.resultRight}>
            <Text style={styles.resultPrice}>{formatUSD(item.price_market)}</Text>
            {isBusy ? (
              <ActivityIndicator size="small" color={colors.brand} style={{ marginLeft: 8 }} />
            ) : (
              <Ionicons name="chevron-forward" size={18} color={colors.onSurfaceSecondary} />
            )}
          </View>
        </Pressable>
      );
    },
    [handlePick, picking],
  );

  const listHeader = useMemo(() => {
    if (loading) {
      return (
        <View style={styles.emptyState}>
          <ActivityIndicator color={colors.brand} />
          <Text style={styles.emptyText}>Searching…</Text>
        </View>
      );
    }
    if (error) {
      return (
        <View style={styles.emptyState}>
          <Ionicons name="alert-circle-outline" size={22} color={colors.onSurfaceSecondary} />
          <Text style={styles.emptyText}>{error}</Text>
        </View>
      );
    }
    if (query.trim().length < 2) {
      return (
        <View style={styles.emptyState}>
          <Ionicons name="search-outline" size={22} color={colors.onSurfaceSecondary} />
          <Text style={styles.emptyText}>
            Type at least 2 letters of the Pokémon name (e.g. Charizard, Pikachu).
          </Text>
        </View>
      );
    }
    return null;
  }, [loading, error, query]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.backdrop}>
        <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
        <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            style={styles.sheet}
          >
            <View style={styles.header}>
              <Text style={styles.title}>Search cards</Text>
              <Pressable
                testID="manual-search-close"
                onPress={onClose}
                hitSlop={12}
                style={styles.closeBtn}
              >
                <Ionicons name="close" size={22} color={colors.onSurface} />
              </Pressable>
            </View>
            <View style={styles.inputWrap}>
              <Ionicons name="search" size={18} color={colors.onSurfaceSecondary} />
              <TextInput
                ref={inputRef}
                value={query}
                onChangeText={setQuery}
                placeholder="Type Pokémon name…"
                placeholderTextColor={colors.onSurfaceSecondary}
                style={styles.input}
                autoCapitalize="words"
                autoCorrect={false}
                returnKeyType="search"
                testID="manual-search-input"
              />
              {query.length > 0 ? (
                <Pressable
                  testID="manual-search-clear"
                  onPress={() => setQuery("")}
                  hitSlop={10}
                >
                  <Ionicons name="close-circle" size={18} color={colors.onSurfaceSecondary} />
                </Pressable>
              ) : null}
            </View>
            <FlatList
              data={results}
              keyExtractor={(item, i) => `${item.set_name}-${item.number}-${i}`}
              renderItem={renderItem}
              ListHeaderComponent={listHeader}
              contentContainerStyle={{ paddingBottom: spacing.xl }}
              keyboardShouldPersistTaps="handled"
              testID="manual-search-list"
            />
          </KeyboardAvoidingView>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(3, 8, 20, 0.55)",
    justifyContent: "flex-end",
  },
  safe: { flex: 1, justifyContent: "flex-end" },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    maxHeight: "88%",
    minHeight: "60%",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.md,
  },
  title: { color: colors.onSurface, fontSize: 20, fontWeight: "700" },
  closeBtn: {
    padding: 4,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceSecondary,
  },
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: Platform.OS === "ios" ? spacing.sm : 2,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  input: {
    flex: 1,
    color: colors.onSurface,
    fontSize: 16,
    fontWeight: "500",
    paddingVertical: 8,
  },
  resultRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSecondary,
    marginBottom: 8,
  },
  resultRowPressed: {
    opacity: 0.7,
    transform: [{ scale: 0.99 }],
  },
  resultTextWrap: { flex: 1, marginRight: spacing.sm },
  resultName: { color: colors.onSurface, fontSize: 15, fontWeight: "700" },
  resultSet: {
    color: colors.onSurfaceSecondary,
    fontSize: 12,
    marginTop: 2,
    fontWeight: "500",
  },
  resultRight: { flexDirection: "row", alignItems: "center", gap: 4 },
  resultPrice: { color: colors.brand, fontSize: 15, fontWeight: "700" },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.xl,
    gap: spacing.sm,
  },
  emptyText: {
    color: colors.onSurfaceSecondary,
    fontSize: 13,
    textAlign: "center",
    paddingHorizontal: spacing.lg,
  },
});
