import React, { useEffect, useRef } from "react";
import { View, StyleSheet, Animated } from "react-native";
import { colors, radius } from "@/src/theme";

const RETICLE_W = 240;
const RETICLE_H = 336;

type Props = {
  scanning: boolean;
  pulse: boolean; // triggers a success pulse on card ID
  lockState?: "idle" | "scanning" | "candidate" | "locked";
};

export default function ReticleAnim({ scanning, pulse, lockState = "idle" }: Props) {
  const sweepAnim = useRef(new Animated.Value(0)).current;
  const glowAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (scanning) {
      sweepAnim.setValue(0);
      Animated.loop(
        Animated.timing(sweepAnim, {
          toValue: 1,
          duration: 1400,
          useNativeDriver: true,
        })
      ).start();
      Animated.timing(glowAnim, {
        toValue: 1,
        duration: 250,
        useNativeDriver: true,
      }).start();
    } else {
      sweepAnim.stopAnimation();
      Animated.timing(sweepAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start();
      Animated.timing(glowAnim, {
        toValue: 0,
        duration: 250,
        useNativeDriver: true,
      }).start();
    }
  }, [scanning, sweepAnim, glowAnim]);

  useEffect(() => {
    if (pulse) {
      pulseAnim.setValue(0);
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 0,
          duration: 500,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [pulse, pulseAnim]);

  const sweepStyle = {
    transform: [
      {
        translateY: sweepAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [0, RETICLE_H - 3],
        }),
      },
    ],
    opacity: glowAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [0.5, 1],
    }),
  };

  const glowStyle = {
    opacity: glowAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [0.15, 0.5],
    }),
  };

  const pulseStyle = {
    opacity: pulseAnim,
    transform: [
      {
        scale: pulseAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [1, 1.08],
        }),
      },
    ],
  };

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
