import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Dimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { BlurView } from "expo-blur";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius, spacing } from "@/src/theme";
import { fetchGradedPrices, GradedPricesResponse, estimateGrade, GradeEstimate } from "@/src/lib/api";

const { height } = Dimensions.get("window");

export type DetailCard = {
  id?: string;
  name: string;
  set_name?: string | null;
  number?: string | null;
  rarity?: string | null;
  language?: string | null;
  image_url?: string | null;
  price_market?: number | null;
  price_low?: number | null;
  price_high?: number | null;
  price_mid?: number | null;
};

function formatUSD(v: number | null | undefined) {
  if (v == null || isNaN(v) || v <= 0) return "—";
  if (v >= 1000) return `$${(v / 1000).toFixed(v >= 10000 ? 1 : 2)}k`;
  return `$${v.toFixed(2)}`;
}

export default function CardDetailSheet({
  visible,
  card,
  onClose,
  onRemove,
  onCaptureForGrade,
}: {
  visible: boolean;
  card: DetailCard | null;
  onClose: () => void;
  onRemove?: () => void;
  onCaptureForGrade?: () => Promise<string | null>;
}) {
  const [graded, setGraded] = useState<GradedPricesResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [gradeEst, setGradeEst] = useState<GradeEstimate | null>(null);
  const [gradeLoading, setGradeLoading] = useState(false);
  const [gradeErr, setGradeErr] = useState<string | null>(null);

  useEffect(() => {
    if (!visible || !card) return;
    setGraded(null);
    setErrMsg(null);
    setGradeEst(null);
    setGradeErr(null);
    setLoading(true);
    fetchGradedPrices({
      name: card.name,
      set_name: card.set_name,
      number: card.number,
      rarity: card.rarity,
      language: card.language,
      raw_market: card.price_market ?? card.price_mid ?? null,
    })
      .then((g) => setGraded(g))
      .catch((e: any) => setErrMsg(e?.userMessage || "Couldn't fetch graded values"))
      .finally(() => setLoading(false));
  }, [visible, card]);

  if (!card) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.sheet} testID="card-detail-sheet">
          <SafeAreaView edges={["bottom"]} style={{ flex: 1 }}>
            {/* Handle */}
            <View style={styles.handle} />

            <ScrollView
              contentContainerStyle={{ paddingBottom: spacing.xxxl }}
              showsVerticalScrollIndicator={false}
            >
              {/* Hero card image + core info */}
              <View style={styles.hero}>
                {card.image_url ? (
                  <Image
                    source={{ uri: card.image_url }}
                    style={styles.heroImg}
                    contentFit="contain"
                  />
                ) : (
                  <View style={[styles.heroImg, styles.heroImgEmpty]}>
                    <Ionicons name="card-outline" size={48} color={colors.onSurfaceTertiary} />
                  </View>
                )}
              </View>

              <View style={styles.identity}>
                <Text style={styles.name} numberOfLines={2} testID="detail-card-name">
                  {card.name}
                </Text>
                <Text style={styles.meta}>
                  {[card.set_name, card.number].filter(Boolean).join(" · ") || "Unknown set"}
                </Text>
                <View style={styles.chipRow}>
                  {card.language && card.language !== "english" ? (
                    <View style={[styles.chip, styles.chipLang]}>
                      <Text style={styles.chipText}>{card.language?.toUpperCase()}</Text>
                    </View>
                  ) : null}
                  {card.rarity ? (
                    <View style={styles.chip}>
                      <Text style={styles.chipText}>{card.rarity}</Text>
                    </View>
                  ) : null}
                </View>
              </View>

              {/* Raw price block */}
              <SectionHeader label="RAW MARKET" hint="Live · JustTCG" />
              <View style={styles.rawRow}>
                <PriceTile label="MARKET" value={card.price_market} big />
                <PriceTile label="NM" value={graded?.raw_nm ?? card.price_market} />
                <PriceTile label="LP" value={graded?.raw_lp} />
              </View>

              {/* Graded block */}
              <SectionHeader label="GRADED SLAB VALUES" hint="AI-estimated" />
              {loading ? (
                <View style={styles.loadingBlock}>
                  <ActivityIndicator color={colors.brand} />
                  <Text style={styles.loadingText}>Analyzing recent sales…</Text>
                </View>
              ) : errMsg ? (
                <View style={styles.errBlock}>
                  <Ionicons name="warning-outline" size={16} color={colors.warning} />
                  <Text style={styles.errText}>{errMsg}</Text>
                </View>
              ) : graded ? (
                <View style={styles.gradedGrid}>
                  {graded.grades.map((g) => (
                    <GradeTile key={g.label} label={g.label} value={g.value ?? null} />
                  ))}
                </View>
              ) : null}

              {graded?.disclaimer ? (
                <BlurView intensity={40} tint="dark" style={styles.disclaimer}>
                  <Ionicons name="information-circle-outline" size={14} color={colors.onSurfaceTertiary} />
                  <Text style={styles.disclaimerText}>{graded.disclaimer}</Text>
                </BlurView>
              ) : null}

              {/* Grade estimate section */}
              {onCaptureForGrade ? (
                <>
                  <SectionHeader label="CONDITION SCAN" hint="AI-estimated" />
                  {!gradeEst && !gradeLoading ? (
                    <Pressable
                      testID="estimate-grade-btn"
                      onPress={async () => {
                        setGradeErr(null);
                        setGradeLoading(true);
                        try {
                          const b64 = await onCaptureForGrade();
                          if (!b64) {
                            setGradeErr("Could not capture a frame — try scanning again.");
                          } else {
                            const est = await estimateGrade(b64);
                            setGradeEst(est);
                          }
                        } catch (e: any) {
                          setGradeErr(e?.userMessage || "Grade estimation failed");
                        } finally {
                          setGradeLoading(false);
                        }
                      }}
                      style={styles.gradeCta}
                    >
                      <Ionicons name="scan-outline" size={18} color={colors.onBrand} />
                      <Text style={styles.gradeCtaText}>ESTIMATE GRADE FROM SCAN</Text>
                    </Pressable>
                  ) : null}
                  {gradeLoading ? (
                    <View style={styles.loadingBlock}>
                      <ActivityIndicator color={colors.brand} />
                      <Text style={styles.loadingText}>
                        Analyzing centering, corners, edges, surface…
                      </Text>
                    </View>
                  ) : null}
                  {gradeErr ? (
                    <View style={styles.errBlock}>
                      <Ionicons name="warning-outline" size={16} color={colors.warning} />
                      <Text style={styles.errText}>{gradeErr}</Text>
                    </View>
                  ) : null}
                  {gradeEst ? (
                    <View style={styles.gradeResult}>
                      <View style={styles.gradeOverallRow}>
                        <View>
                          <Text style={styles.gradeOverallLabel}>OVERALL</Text>
                          <Text style={styles.gradeOverallValue}>
                            {gradeEst.overall_grade != null
                              ? gradeEst.overall_grade.toFixed(1)
                              : "—"}
                            <Text style={styles.gradeOverallOutOf}> / 10</Text>
                          </Text>
                          {gradeEst.overall_label ? (
                            <Text style={styles.gradeOverallHint}>
                              {gradeEst.overall_label}
                            </Text>
                          ) : null}
                        </View>
                      </View>
                      <View style={styles.gradeSubGrid}>
                        <SubGrade
                          label="CENTERING"
                          value={
                            gradeEst.centering ||
                            (gradeEst.centering_pct != null
                              ? `${Math.round(gradeEst.centering_pct)}%`
                              : "—")
                          }
                        />
                        <SubGrade
                          label="CORNERS"
                          value={
                            gradeEst.corners_grade != null
                              ? `${gradeEst.corners_grade.toFixed(1)}/10`
                              : "—"
                          }
                        />
                        <SubGrade
                          label="EDGES"
                          value={
                            gradeEst.edges_grade != null
                              ? `${gradeEst.edges_grade.toFixed(1)}/10`
                              : "—"
                          }
                        />
                        <SubGrade
                          label="SURFACE"
                          value={
                            gradeEst.surface_grade != null
                              ? `${gradeEst.surface_grade.toFixed(1)}/10`
                              : "—"
                          }
                        />
                      </View>
                      {gradeEst.notes ? (
                        <Text style={styles.gradeNotes}>{gradeEst.notes}</Text>
                      ) : null}
                      <BlurView intensity={40} tint="dark" style={styles.disclaimer}>
                        <Ionicons
                          name="information-circle-outline"
                          size={14}
                          color={colors.onSurfaceTertiary}
                        />
                        <Text style={styles.disclaimerText}>{gradeEst.disclaimer}</Text>
                      </BlurView>
                    </View>
                  ) : null}
                </>
              ) : null}

              {onRemove ? (
                <Pressable
                  testID="detail-remove-btn"
                  onPress={() => {
                    onRemove();
                    onClose();
                  }}
                  style={styles.removeBtn}
                >
                  <Ionicons name="trash-outline" size={16} color={colors.error} />
                  <Text style={styles.removeText}>REMOVE FROM COLLECTION</Text>
                </Pressable>
              ) : null}
            </ScrollView>

            <Pressable testID="detail-close-btn" onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={22} color={colors.onSurface} />
            </Pressable>
          </SafeAreaView>
        </View>
      </View>
    </Modal>
  );
}

function SectionHeader({ label, hint }: { label: string; hint?: string }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{label}</Text>
      {hint ? <Text style={styles.sectionHint}>{hint}</Text> : null}
    </View>
  );
}

function PriceTile({
  label,
  value,
  big,
}: {
  label: string;
  value: number | null | undefined;
  big?: boolean;
}) {
  return (
    <View style={[styles.tile, big && styles.tileBig]}>
      <Text style={styles.tileLabel}>{label}</Text>
      <Text style={[styles.tileValue, big && styles.tileValueBig]}>{formatUSD(value)}</Text>
    </View>
  );
}

function GradeTile({ label, value }: { label: string; value: number | null }) {
  const isSpecial = /black label|pristine|10\b/i.test(label);
  return (
    <View style={[styles.gradeTile, isSpecial && styles.gradeTileSpecial]}>
      <Text style={[styles.gradeLabel, isSpecial && styles.gradeLabelSpecial]}>{label}</Text>
      <Text style={[styles.gradeValue, isSpecial && styles.gradeValueSpecial]}>
        {formatUSD(value)}
      </Text>
    </View>
  );
}

function SubGrade({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.subGrade}>
      <Text style={styles.subGradeLabel}>{label}</Text>
      <Text style={styles.subGradeValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: height * 0.92,
    minHeight: height * 0.65,
    borderTopWidth: 1,
    borderTopColor: colors.brandTertiary,
  },
  handle: {
    alignSelf: "center",
    width: 44,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.borderStrong,
    marginTop: 8,
    marginBottom: 6,
  },
  hero: {
    alignItems: "center",
    marginTop: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  heroImg: {
    width: 190,
    height: 265,
    borderRadius: radius.md,
  },
  heroImgEmpty: {
    backgroundColor: colors.surfaceSecondary,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  identity: { alignItems: "center", marginTop: spacing.md, paddingHorizontal: spacing.lg },
  name: {
    color: colors.onSurface,
    fontSize: 24,
    fontWeight: "900",
    letterSpacing: 0.3,
    textAlign: "center",
  },
  meta: { color: colors.onSurfaceSecondary, fontSize: 13, marginTop: 4, textAlign: "center" },
  chipRow: { flexDirection: "row", flexWrap: "wrap", marginTop: 8, gap: 6, justifyContent: "center" },
  chip: {
    backgroundColor: colors.brandTertiary,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.sm,
  },
  chipLang: {
    backgroundColor: colors.surfaceTertiary,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  chipText: { color: colors.onBrandTertiary, fontSize: 10, fontWeight: "700", letterSpacing: 0.5 },

  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    paddingHorizontal: spacing.lg,
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
  },
  sectionTitle: {
    color: colors.onSurfaceTertiary,
    fontSize: 11,
    letterSpacing: 1.5,
    fontWeight: "700",
  },
  sectionHint: {
    color: colors.onSurfaceTertiary,
    fontSize: 10,
    letterSpacing: 0.6,
    fontStyle: "italic",
  },

  rawRow: {
    flexDirection: "row",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  tile: {
    flex: 1,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tileBig: {
    borderColor: colors.brand,
    backgroundColor: colors.brandTertiary,
  },
  tileLabel: {
    color: colors.onSurfaceTertiary,
    fontSize: 9,
    letterSpacing: 1.2,
    fontWeight: "700",
  },
  tileValue: {
    color: colors.onSurface,
    fontSize: 18,
    fontWeight: "800",
    marginTop: 4,
    letterSpacing: -0.2,
  },
  tileValueBig: { color: colors.brand, fontSize: 24 },

  gradedGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  gradeTile: {
    width: "48%",
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  gradeTileSpecial: {
    backgroundColor: colors.brandTertiary,
    borderColor: colors.brandSecondary,
  },
  gradeLabel: {
    color: colors.onSurfaceTertiary,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.6,
  },
  gradeLabelSpecial: { color: colors.onBrandTertiary },
  gradeValue: {
    color: colors.onSurface,
    fontSize: 20,
    fontWeight: "900",
    letterSpacing: -0.3,
    marginTop: 4,
  },
  gradeValueSpecial: { color: colors.brand },

  loadingBlock: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  loadingText: { color: colors.onSurfaceSecondary, fontSize: 13 },

  errBlock: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  errText: { color: colors.warning, fontSize: 12, flex: 1 },

  disclaimer: {
    flexDirection: "row",
    gap: 6,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  disclaimerText: {
    color: colors.onSurfaceSecondary,
    fontSize: 11,
    lineHeight: 16,
    flex: 1,
  },

  removeBtn: {
    marginTop: spacing.xl,
    marginHorizontal: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.error,
  },
  removeText: {
    color: colors.error,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1,
  },

  closeBtn: {
    position: "absolute",
    top: 12,
    right: 12,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },

  // Grade section
  gradeCta: {
    marginHorizontal: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: radius.md,
    backgroundColor: colors.brand,
  },
  gradeCtaText: {
    color: colors.onBrand,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1.2,
  },
  gradeResult: {
    marginHorizontal: spacing.lg,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  gradeOverallRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  gradeOverallLabel: {
    color: colors.onSurfaceTertiary,
    fontSize: 10,
    letterSpacing: 1.4,
    fontWeight: "700",
  },
  gradeOverallValue: {
    color: colors.brand,
    fontSize: 40,
    fontWeight: "900",
    letterSpacing: -0.5,
    marginTop: 2,
  },
  gradeOverallOutOf: {
    color: colors.onSurfaceTertiary,
    fontSize: 16,
    fontWeight: "700",
  },
  gradeOverallHint: {
    color: colors.onSurfaceSecondary,
    fontSize: 12,
    fontWeight: "600",
    marginTop: 2,
  },
  gradeSubGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: spacing.md,
  },
  subGrade: {
    width: "48%",
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    padding: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  subGradeLabel: {
    color: colors.onSurfaceTertiary,
    fontSize: 9,
    letterSpacing: 1,
    fontWeight: "700",
  },
  subGradeValue: {
    color: colors.onSurface,
    fontSize: 14,
    fontWeight: "800",
    marginTop: 4,
  },
  gradeNotes: {
    color: colors.onSurfaceSecondary,
    fontSize: 12,
    marginTop: spacing.sm,
    lineHeight: 17,
    fontStyle: "italic",
  },
});
