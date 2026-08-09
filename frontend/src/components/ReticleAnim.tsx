import React, { useEffect } from "react";
import { View, StyleSheet } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  withSequence,
  cancelAnimation,
  Easing,
} from "react-native-reanimated";
import { colors, radius } from "@/src/theme";

const RETICLE_W = 240;
const RETICLE_H = 336;

type Props = {
  scanning: boolean;
  pulse: boolean; // triggers a success pulse on card ID
  lockState?: "idle" | "scanning" | "candidate" | "locked";
};

export default function ReticleAnim({ scanning, pulse, lockState = "idle" }: Props) {
  const sweep = useSharedValue(0);
  const glow = useSharedValue(0);
  const pulseVal = useSharedValue(0);

  useEffect(() => {
    if (scanning) {
      sweep.value = 0;
      sweep.value = withRepeat(
        withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.ease) }),
        -1,
        true,
      );
      glow.value = withTiming(1, { duration: 250 });
    } else {
      cancelAnimation(sweep);
      sweep.value = withTiming(0, { duration: 200 });
      glow.value = withTiming(0, { duration: 250 });
    }
  }, [scanning, sweep, glow]);

  useEffect(() => {
    if (pulse) {
      pulseVal.value = 0;
      pulseVal.value = withSequence(
        withTiming(1, { duration: 200, easing: Easing.out(Easing.quad) }),
        withTiming(0, { duration: 500, easing: Easing.in(Easing.quad) }),
      );
    }
  }, [pulse, pulseVal]);

  const sweepStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: sweep.value * (RETICLE_H - 3) }],
    opacity: 0.5 + glow.value * 0.5,
  }));

  const glowStyle = useAnimatedStyle(() => ({
    opacity: 0.15 + glow.value * 0.35,
  }));

  const pulseStyle = useAnimatedStyle(() => ({
    opacity: pulseVal.value,
    transform: [{ scale: 1 + pulseVal.value * 0.08 }],
  }));

  const bracketColor =
    lockState === "locked"
      ? colors.success
      : lockState === "candidate"
      ? colors.warning
      : colors.brand;

  return (
    <View style={styles.wrap} pointerEvents="none">
      <View style={styles.reticle}>
        {/* Corner brackets — color reflects lock state */}
        <View style={[styles.corner, styles.tl, { borderColor: bracketColor }]} />
        <View style={[styles.corner, styles.tr, { borderColor: bracketColor }]} />
        <View style={[styles.corner, styles.bl, { borderColor: bracketColor }]} />
        <View style={[styles.corner, styles.br, { borderColor: bracketColor }]} />

        {/* Ambient glow while scanning */}
        <Animated.View style={[styles.glow, { borderColor: bracketColor, shadowColor: bracketColor }, glowStyle]} />

        {/* Sweeping laser line */}
        <Animated.View style={[styles.sweep, sweepStyle]}>
          <View style={[styles.sweepCore, { backgroundColor: bracketColor }]} />
          <View style={[styles.sweepBlur, { backgroundColor: bracketColor }]} />
        </Animated.View>

        {/* Success pulse ring */}
        <Animated.View style={[styles.pulse, pulseStyle]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  reticle: {
    width: RETICLE_W,
    height: RETICLE_H,
    justifyContent: "flex-start",
    alignItems: "flex-start",
    overflow: "hidden",
  },
  corner: { position: "absolute", width: 32, height: 32, borderColor: colors.brand },
  tl: { top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3 },
  tr: { top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3 },
  bl: { bottom: 0, left: 0, borderBottomWidth: 3, borderLeftWidth: 3 },
  br: { bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3 },
  glow: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 1,
    borderColor: colors.brand,
    borderRadius: radius.sm,
    shadowColor: colors.brand,
    shadowOpacity: 0.6,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 0 },
  },
  sweep: {
    position: "absolute",
    top: 0,
    left: 6,
    right: 6,
    height: 3,
  },
  sweepCore: {
    height: 2,
    backgroundColor: colors.brand,
    borderRadius: 2,
  },
  sweepBlur: {
    height: 24,
    marginTop: -14,
    backgroundColor: colors.brand,
    opacity: 0.18,
    borderRadius: 12,
  },
  pulse: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 3,
    borderColor: colors.success,
    borderRadius: radius.md,
    shadowColor: colors.success,
    shadowOpacity: 0.6,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 0 },
  },
});
