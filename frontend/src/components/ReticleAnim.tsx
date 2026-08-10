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
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const gridAnim = useRef(new Animated.Value(0)).current;
  
  // Region-specific scanning animations
  const nameScanAnim = useRef(new Animated.Value(0)).current;
  const numberScanAnim = useRef(new Animated.Value(0)).current;
  const artScanAnim = useRef(new Animated.Value(0)).current;
  
  // Sweep position animations for each region
  const nameSweepPos = useRef(new Animated.Value(0)).current;
  const numberSweepPos = useRef(new Animated.Value(0)).current;
  const artScanScale = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (scanning) {
      sweepAnim.setValue(0);
      scaleAnim.setValue(1);
      gridAnim.setValue(0);
      nameScanAnim.setValue(0);
      numberScanAnim.setValue(0);
      artScanAnim.setValue(0);
      nameSweepPos.setValue(0);
      numberSweepPos.setValue(0);
      artScanScale.setValue(0);
      
      // Sweep animation
      Animated.loop(
        Animated.timing(sweepAnim, {
          toValue: 1,
          duration: 1200,
          useNativeDriver: true,
        })
      ).start();
      
      // Breathing scale animation
      Animated.loop(
        Animated.sequence([
          Animated.timing(scaleAnim, {
            toValue: 1.02,
            duration: 1500,
            useNativeDriver: true,
          }),
          Animated.timing(scaleAnim, {
            toValue: 1,
            duration: 1500,
            useNativeDriver: true,
          }),
        ])
      ).start();
      
      // Grid scan animation
      Animated.loop(
        Animated.timing(gridAnim, {
          toValue: 1,
          duration: 2000,
          useNativeDriver: true,
        })
      ).start();
      
      // Region-specific scanning sequence with sweeping motions
      const scanSequence = Animated.sequence([
        // Scan name region (top left) - horizontal sweep
        Animated.parallel([
          Animated.timing(nameScanAnim, {
            toValue: 1,
            duration: 400,
            useNativeDriver: true,
          }),
          Animated.timing(nameSweepPos, {
            toValue: 1,
            duration: 400,
            useNativeDriver: true,
          }),
        ]),
        Animated.parallel([
          Animated.timing(nameScanAnim, {
            toValue: 0,
            duration: 200,
            useNativeDriver: true,
          }),
          Animated.timing(nameSweepPos, {
            toValue: 0,
            duration: 200,
            useNativeDriver: true,
          }),
        ]),
        // Scan number region (bottom left) - horizontal sweep
        Animated.parallel([
          Animated.timing(numberScanAnim, {
            toValue: 1,
            duration: 400,
            useNativeDriver: true,
          }),
          Animated.timing(numberSweepPos, {
            toValue: 1,
            duration: 400,
            useNativeDriver: true,
          }),
        ]),
        Animated.parallel([
          Animated.timing(numberScanAnim, {
            toValue: 0,
            duration: 200,
            useNativeDriver: true,
          }),
          Animated.timing(numberSweepPos, {
            toValue: 0,
            duration: 200,
            useNativeDriver: true,
          }),
        ]),
        // Scan artwork region (center) - outward expanding scan
        Animated.parallel([
          Animated.timing(artScanAnim, {
            toValue: 1,
            duration: 400,
            useNativeDriver: true,
          }),
          Animated.timing(artScanScale, {
            toValue: 1,
            duration: 400,
            useNativeDriver: true,
          }),
        ]),
        Animated.parallel([
          Animated.timing(artScanAnim, {
            toValue: 0,
            duration: 200,
            useNativeDriver: true,
          }),
          Animated.timing(artScanScale, {
            toValue: 0,
            duration: 200,
            useNativeDriver: true,
          }),
        ]),
      ]);
      
      Animated.loop(scanSequence).start();
      
      Animated.timing(glowAnim, {
        toValue: 1,
        duration: 250,
        useNativeDriver: true,
      }).start();
    } else {
      sweepAnim.stopAnimation();
      scaleAnim.stopAnimation();
      gridAnim.stopAnimation();
      nameScanAnim.stopAnimation();
      numberScanAnim.stopAnimation();
      artScanAnim.stopAnimation();
      nameSweepPos.stopAnimation();
      numberSweepPos.stopAnimation();
      artScanScale.stopAnimation();
      
      Animated.timing(sweepAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start();
      Animated.timing(scaleAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }).start();
      Animated.timing(gridAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start();
      Animated.timing(nameScanAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start();
      Animated.timing(numberScanAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start();
      Animated.timing(artScanAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start();
      Animated.timing(nameSweepPos, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start();
      Animated.timing(numberSweepPos, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start();
      Animated.timing(artScanScale, {
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
  }, [scanning, sweepAnim, glowAnim, scaleAnim, gridAnim, nameScanAnim, numberScanAnim, artScanAnim, nameSweepPos, numberSweepPos, artScanScale]);

  useEffect(() => {
    if (pulse) {
      pulseAnim.setValue(0);
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 0,
          duration: 600,
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
          outputRange: [0, RETICLE_H - 4],
        }),
      },
    ],
    opacity: glowAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [0.6, 1],
    }),
  };

  const glowStyle = {
    opacity: glowAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [0.2, 0.6],
    }),
  };

  const pulseStyle = {
    opacity: pulseAnim,
    transform: [
      {
        scale: pulseAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [1, 1.12],
        }),
      },
    ],
  };

  const rotateStyle = {
    opacity: 0,
  };
  
  const nameScanStyle = {
    opacity: nameScanAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [0, 0.8],
    }),
  };
  
  const numberScanStyle = {
    opacity: numberScanAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [0, 0.8],
    }),
  };
  
  const artScanStyle = {
    opacity: artScanAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [0, 0.8],
    }),
  };
  
  const nameSweepStyle = {
    transform: [
      {
        translateX: nameSweepPos.interpolate({
          inputRange: [0, 1],
          outputRange: [0, 80],
        }),
      },
    ],
  };
  
  const numberSweepStyle = {
    transform: [
      {
        translateX: numberSweepPos.interpolate({
          inputRange: [0, 1],
          outputRange: [0, 80],
        }),
      },
    ],
  };
  
  const artScanScaleStyle = {
    transform: [
      {
        scale: artScanScale.interpolate({
          inputRange: [0, 1],
          outputRange: [0, 1.5],
        }),
      },
    ],
  };

  const scaleStyle = {
    transform: [
      {
        scale: scaleAnim,
      },
    ],
  };

  const gridStyle = {
    opacity: gridAnim.interpolate({
      inputRange: [0, 0.5, 1],
      outputRange: [0, 0.3, 0],
    }),
  };

  const bracketColor =
    lockState === "locked"
      ? colors.success
      : lockState === "candidate"
      ? colors.warning
      : colors.brand;

  return (
    <View style={styles.wrap} pointerEvents="none">
      <Animated.View style={[styles.reticle, scaleStyle]}>
        {/* Region-specific scanning indicators */}
        {/* Name region scan (top left) - horizontal sweep */}
        <Animated.View style={[styles.scanRegion, styles.nameRegion, nameScanStyle, { borderColor: bracketColor }]}>
          <Animated.View style={[styles.sweepLine, nameSweepStyle, { backgroundColor: bracketColor }]} />
        </Animated.View>
        
        {/* Number region scan (bottom left) - horizontal sweep */}
        <Animated.View style={[styles.scanRegion, styles.numberRegion, numberScanStyle, { borderColor: bracketColor }]}>
          <Animated.View style={[styles.sweepLine, numberSweepStyle, { backgroundColor: bracketColor }]} />
        </Animated.View>
        
        {/* Artwork region scan (center) - outward expanding scan */}
        <Animated.View style={[styles.scanRegion, styles.artRegion, artScanStyle, { borderColor: bracketColor }]}>
          <Animated.View style={[styles.expandRing, artScanScaleStyle, { borderColor: bracketColor }]} />
        </Animated.View>
        
        {/* Scanning grid effect */}
        <Animated.View style={[styles.scanGrid, gridStyle]} />
        
        {/* Corner brackets — color reflects lock state */}
        <View style={[styles.corner, styles.tl, { borderColor: bracketColor }]} />
        <View style={[styles.corner, styles.tr, { borderColor: bracketColor }]} />
        <View style={[styles.corner, styles.bl, { borderColor: bracketColor }]} />
        <View style={[styles.corner, styles.br, { borderColor: bracketColor }]} />

        {/* Inner corner accents */}
        <View style={[styles.innerCorner, styles.itl, { borderColor: bracketColor }]} />
        <View style={[styles.innerCorner, styles.itr, { borderColor: bracketColor }]} />
        <View style={[styles.innerCorner, styles.ibl, { borderColor: bracketColor }]} />
        <View style={[styles.innerCorner, styles.ibr, { borderColor: bracketColor }]} />

        {/* Ambient glow while scanning */}
        <Animated.View style={[styles.glow, { borderColor: bracketColor, shadowColor: bracketColor }, glowStyle]} />

        {/* Enhanced sweeping laser line with gradient effect */}
        <Animated.View style={[styles.sweep, sweepStyle]}>
          <View style={[styles.sweepCore, { backgroundColor: bracketColor }]} />
          <View style={[styles.sweepTopBlur, { backgroundColor: bracketColor }]} />
          <View style={[styles.sweepBottomBlur, { backgroundColor: bracketColor }]} />
          <View style={[styles.sweepGlow, { backgroundColor: bracketColor }]} />
        </Animated.View>

        {/* Success pulse ring */}
        <Animated.View style={[styles.pulse, pulseStyle]} />
        
        {/* Corner dots */}
        <View style={[styles.cornerDot, styles.cdtl, { backgroundColor: bracketColor }]} />
        <View style={[styles.cornerDot, styles.cdtr, { backgroundColor: bracketColor }]} />
        <View style={[styles.cornerDot, styles.cdbl, { backgroundColor: bracketColor }]} />
        <View style={[styles.cornerDot, styles.cdbr, { backgroundColor: bracketColor }]} />
      </Animated.View>
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
  innerCorner: { position: "absolute", width: 16, height: 16, borderColor: colors.brand },
  itl: { top: 8, left: 8, borderTopWidth: 2, borderLeftWidth: 2 },
  itr: { top: 8, right: 8, borderTopWidth: 2, borderRightWidth: 2 },
  ibl: { bottom: 8, left: 8, borderBottomWidth: 2, borderLeftWidth: 2 },
  ibr: { bottom: 8, right: 8, borderBottomWidth: 2, borderRightWidth: 2 },
  outerRing: {
    position: "absolute",
    width: RETICLE_W + 20,
    height: RETICLE_H + 20,
    borderWidth: 1,
    borderRadius: radius.md,
    opacity: 0,
  },
  scanRegion: {
    position: "absolute",
    borderWidth: 2,
    borderRadius: 4,
  },
  nameRegion: {
    top: 10,
    left: 10,
    width: 80,
    height: 30,
  },
  numberRegion: {
    bottom: 10,
    left: 10,
    width: 80,
    height: 30,
  },
  artRegion: {
    top: 60,
    left: 60,
    width: 120,
    height: 150,
  },
  sweepLine: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
    borderRadius: 2,
  },
  expandRing: {
    position: "absolute",
    top: "50%",
    left: "50%",
    marginTop: -30,
    marginLeft: -30,
    width: 60,
    height: 60,
    borderWidth: 2,
    borderRadius: 30,
  },
  scanGrid: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 1,
    borderStyle: "dashed",
    opacity: 0.2,
  },
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
    height: 4,
  },
  sweepCore: {
    height: 2,
    backgroundColor: colors.brand,
    borderRadius: 2,
  },
  sweepTopBlur: {
    height: 20,
    marginTop: -18,
    backgroundColor: colors.brand,
    opacity: 0.15,
    borderRadius: 10,
  },
  sweepBottomBlur: {
    height: 20,
    marginTop: 0,
    backgroundColor: colors.brand,
    opacity: 0.15,
    borderRadius: 10,
  },
  sweepGlow: {
    position: "absolute",
    left: -10,
    right: -10,
    height: 30,
    marginTop: -13,
    backgroundColor: colors.brand,
    opacity: 0.08,
    borderRadius: 15,
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
  cornerDot: { position: "absolute", width: 6, height: 6, borderRadius: 3, backgroundColor: colors.brand },
  cdtl: { top: -3, left: -3 },
  cdtr: { top: -3, right: -3 },
  cdbl: { bottom: -3, left: -3 },
  cdbr: { bottom: -3, right: -3 },
});
