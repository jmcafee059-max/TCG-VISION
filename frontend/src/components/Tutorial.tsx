import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  Dimensions,
} from "react-native";
import { BlurView } from "expo-blur";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius, spacing } from "@/src/theme";

const { width } = Dimensions.get("window");

type Step = {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body: string;
};

const STEPS: Step[] = [
  {
    icon: "scan-outline",
    title: "POINT & SCAN",
    body:
      "Set your phone in a stand and hold a Pokémon card inside the reticle. The scanner runs on a live loop — a new card in view is identified automatically.",
  },
  {
    icon: "pricetags-outline",
    title: "LIVE PRICES",
    body:
      "Once a card is identified, you'll see its name, set, and rarity, plus the live market / low / mid / high prices pulled from JustTCG (English + Japanese cards supported).",
  },
  {
    icon: "mic-outline",
    title: "ASK BY VOICE",
    body:
      "Press and HOLD the yellow mic button in the bottom-right to ask any question about the card in view — 'How much is this?', 'Is this a good deal?', 'Which set is this from?'. Release to send.",
  },
  {
    icon: "time-outline",
    title: "HISTORY & SETTINGS",
    body:
      "Every scan is saved to the HISTORY tab so you can review or clear it. SETTINGS shows the models and price source in use.",
  },
];

export default function Tutorial({
  visible,
  onDone,
}: {
  visible: boolean;
  onDone: () => void;
}) {
  const [i, setI] = useState(0);
  const step = STEPS[i];
  const isLast = i === STEPS.length - 1;

  const reset = () => setI(0);

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={onDone}
      onShow={reset}
    >
      <View style={styles.backdrop}>
        <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
        <View style={styles.card} testID="tutorial-modal">
          <View style={styles.iconWrap}>
            <Ionicons name={step.icon} size={36} color={colors.brand} />
          </View>
          <Text style={styles.stepLabel}>
            STEP {i + 1} / {STEPS.length}
          </Text>
          <Text style={styles.title}>{step.title}</Text>
          <Text style={styles.body}>{step.body}</Text>

          <View style={styles.dots}>
            {STEPS.map((_, idx) => (
              <View
                key={idx}
                style={[styles.dot, idx === i && styles.dotActive]}
              />
            ))}
          </View>

          <View style={styles.buttonRow}>
            <Pressable
              testID="tutorial-skip-btn"
              onPress={onDone}
              style={styles.skipBtn}
            >
              <Text style={styles.skipText}>SKIP</Text>
            </Pressable>
            <Pressable
              testID={isLast ? "tutorial-done-btn" : "tutorial-next-btn"}
              onPress={() => {
                if (isLast) onDone();
                else setI(i + 1);
              }}
              style={styles.nextBtn}
            >
              <Text style={styles.nextText}>
                {isLast ? "GOT IT" : "NEXT"}
              </Text>
              <Ionicons
                name={isLast ? "checkmark" : "arrow-forward"}
                size={16}
                color={colors.onBrand}
              />
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
  },
  card: {
    width: Math.min(width - 40, 380),
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
  },
  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.brandTertiary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.md,
  },
  stepLabel: {
    color: colors.onSurfaceTertiary,
    fontSize: 10,
    letterSpacing: 1.5,
    fontWeight: "700",
  },
  title: {
    color: colors.onSurface,
    fontSize: 22,
    fontWeight: "900",
    letterSpacing: 1,
    marginTop: 6,
    textAlign: "center",
  },
  body: {
    color: colors.onSurfaceSecondary,
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
    marginTop: spacing.md,
    minHeight: 100,
  },
  dots: {
    flexDirection: "row",
    gap: 6,
    marginTop: spacing.md,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.border,
  },
  dotActive: {
    width: 20,
    backgroundColor: colors.brand,
  },
  buttonRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
    marginTop: spacing.xl,
  },
  skipBtn: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  skipText: {
    color: colors.onSurfaceTertiary,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1,
  },
  nextBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: spacing.lg,
    paddingVertical: 12,
    borderRadius: radius.md,
    backgroundColor: colors.brand,
  },
  nextText: {
    color: colors.onBrand,
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 1,
  },
});
