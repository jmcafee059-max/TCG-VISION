import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CameraView, useCameraPermissions } from "expo-camera";
import {
  useAudioRecorder,
  useAudioPlayer,
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
} from "expo-audio";
import * as Haptics from "expo-haptics";
import * as ImageManipulator from "expo-image-manipulator";
import { BlurView } from "expo-blur";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { colors, radius, spacing } from "@/src/theme";
import {
  CardInfo,
  scanCard,
  transcribeAudio,
  voiceChat,
  addToCollection,
  pickCandidate,
} from "@/src/lib/api";
import { storage } from "@/src/utils/storage";
import { useSettings } from "@/src/lib/settings";
import Tutorial from "@/src/components/Tutorial";
import ReticleAnim from "@/src/components/ReticleAnim";
import CardDetailSheet, { DetailCard } from "@/src/components/CardDetailSheet";
import { ManualSearchSheet } from "@/src/components/ManualSearchSheet";

const FRAME_SIMILARITY_THRESHOLD = 0.985; // skip AI call if new frame is >98.5% similar to previous frame

// Downsample a base64 image to a tiny grayscale-ish signature for change detection
async function frameSignature(base64: string): Promise<number[]> {
  // Take first N bytes as a coarse fingerprint (extremely fast — no image parsing).
  // This is enough to detect "same frame" vs "moved camera" in practice because
  // JPEG headers differ almost byte-for-byte between distinct exposures.
  const sample = base64.slice(200, 1200); // skip header
  const buckets: number[] = new Array(32).fill(0);
  for (let i = 0; i < sample.length; i++) {
    buckets[i % 32] += sample.charCodeAt(i);
  }
  return buckets;
}

function frameSimilarity(a: number[] | null, b: number[]): number {
  if (!a || a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom > 0 ? dot / denom : 0;
}

function formatPrice(v: number | null | undefined) {
  if (v == null || isNaN(v)) return "—";
  return `£${v.toFixed(2)}`;
}

export default function ScannerScreen() {
  const insets = useSafeAreaInsets();
  const { settings, ready: settingsReady } = useSettings();
  const [camPerm, requestCamPerm] = useCameraPermissions();
  const [micGranted, setMicGranted] = useState<boolean>(false);
  const cameraRef = useRef<CameraView | null>(null);
  const cameraReadyRef = useRef(false);

  const [scanning, setScanning] = useState(false);
  const [card, setCard] = useState<CardInfo | null>(null);
  const [statusMsg, setStatusMsg] = useState("Point camera at a Pokémon card");
  const [showTutorial, setShowTutorial] = useState(false);
  const [pulseTick, setPulseTick] = useState(0);
  // Multi-frame consensus: only "LOCK" a card when the last two scans agree on name+number
  const [lockState, setLockState] = useState<"idle" | "scanning" | "candidate" | "locked">("idle");
  const lastResultRef = useRef<{ name: string; number: string } | null>(null);

  // Voice state
  const [assistantState, setAssistantState] = useState<
    "idle" | "listening" | "thinking" | "speaking"
  >("idle");
  const [lastUserText, setLastUserText] = useState<string>("");
  const [lastReply, setLastReply] = useState<string>("");
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());
  const [detail, setDetail] = useState<DetailCard | null>(null);
  const [batchTotal, setBatchTotal] = useState(0);
  const [batchCount, setBatchCount] = useState(0);
  const [manualSearchOpen, setManualSearchOpen] = useState(false);
  const lastAnnouncedKeyRef = useRef<string>("");
  const lastFrameSigRef = useRef<number[] | null>(null);
  const lastCaptureBase64Ref = useRef<string | null>(null);
  const scanningRef = useRef(false);
  const lockStateRef = useRef<"idle" | "scanning" | "candidate" | "locked">("idle");

  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const player = useAudioPlayer();

  const cardRef = useRef<CardInfo | null>(null);
  useEffect(() => {
    cardRef.current = card;
  }, [card]);

  const settingsRef = useRef(settings);
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    lockStateRef.current = lockState;
  }, [lockState]);

  // ---------- Permissions + first-boot tutorial ----------
  useEffect(() => {
    (async () => {
      if (!camPerm?.granted) await requestCamPerm();
      const mic = await requestRecordingPermissionsAsync();
      setMicGranted(!!mic.granted);
      try {
        await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
      } catch {}
      const seen = await storage.getItem<boolean>("tutorial_seen", false);
      if (!seen) setShowTutorial(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const closeTutorial = useCallback(async () => {
    setShowTutorial(false);
    await storage.setItem("tutorial_seen", true);
  }, []);

  // ---------- Continuous card scan loop ----------
  const captureAndScan = useCallback(async () => {
    if (!cameraReadyRef.current || scanningRef.current || !cameraRef.current) return;
    scanningRef.current = true;
    try {
      setScanning(true);
      setLockState((s) => (s === "locked" ? "locked" : "scanning"));
      setStatusMsg("Identifying card…");

      // 1) Grab high-quality frame from camera for 4K crystal clear scanning
      const pic = await cameraRef.current.takePictureAsync({
        base64: true,
        quality: 1,
        skipProcessing: false,
        shutterSound: false,
      } as any);
      if (!pic?.base64) return;

      // 2) Change-detection: skip AI call ONLY when we've already locked a card
      //    and the new frame is nearly identical to the last one (steady view).
      //    Never skip while hunting — always try to identify.
      const sig = await frameSignature(pic.base64);
      const sim = frameSimilarity(lastFrameSigRef.current, sig);
      lastFrameSigRef.current = sig;
      if (lockStateRef.current === "locked" && sim >= FRAME_SIMILARITY_THRESHOLD) {
        setStatusMsg("Locked · steady view");
        return;
      }

      // 3) Downscale + JPEG-compress. 900px keeps collector-number text legible for Gemini
      //    while still being ~5-8x smaller than the raw camera capture.
      let uploadB64 = pic.base64;
      try {
        const resized = await ImageManipulator.manipulateAsync(
          pic.uri!,
          [{ resize: { width: 900 } }],
          { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG, base64: true },
        );
        if (resized.base64) uploadB64 = resized.base64;
      } catch {
        // If manipulator fails, fall back to original base64
      }

      const result = await scanCard(uploadB64);
      const threshold = (settingsRef.current.confidenceThresholdPct ?? 40) / 100;
      const conf = result.confidence ?? 0;

      if (result.identified && conf >= threshold) {
        lastCaptureBase64Ref.current = uploadB64;
        const key = { name: result.name || "", number: result.number || "" };
        const prev = lastResultRef.current;
        // Anti-hallucination lock policy:
        //  A) confidence >= 0.85 → instant lock (Claude is highly certain)
        //  B) confidence >= 0.55 AND previous frame read the SAME name → 2-frame consensus
        //  C) otherwise stay in "candidate" state and keep trying
        const nameMatch = !!prev && prev.name === key.name;
        const instantLock = conf >= 0.85;
        const consensusLock = nameMatch && conf >= 0.55;
        const matches = instantLock || consensusLock;
        lastResultRef.current = key;

        if (matches) {
          const changed =
            result.name !== cardRef.current?.name ||
            result.number !== cardRef.current?.number;
          setCard(result);
          setLockState("locked");
          setStatusMsg(
            result.price.market
              ? "Locked · price loaded"
              : result.number
              ? "Locked · no exact price match"
              : "Locked · printing not confirmed",
          );
          if (changed) {
            setPulseTick((t) => t + 1);
            if (settingsRef.current.hapticsEnabled) {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            }
            // Batch mode: add each newly locked card's market price to the running total
            if (settingsRef.current.batchMode && result.price.market != null) {
              setBatchTotal((t) => t + (result.price.market || 0));
              setBatchCount((c) => c + 1);
            }
            // Voice announce on lock (once per unique card)
            const announceKey = `${result.name}|${result.number}`;
            if (
              settingsRef.current.announceOnLock &&
              settingsRef.current.voiceEnabled &&
              announceKey !== lastAnnouncedKeyRef.current
            ) {
              lastAnnouncedKeyRef.current = announceKey;
              const price =
                result.price.market != null
                  ? `market price ${result.price.market.toFixed(2)} US dollars`
                  : "no exact price";
              const line = `${result.name}${result.set_name ? ", " + result.set_name : ""}. ${price}.`;
              voiceChat(line, result, settingsRef.current.ttsVoice)
                .then(({ audio_base64, reply }) => speakReply(audio_base64, reply))
                .catch(() => {});
            }
          }
        } else {
          setLockState("candidate");
          setStatusMsg(`Confirming ${key.name}${key.number ? " " + key.number : ""}…`);
          setTimeout(() => captureAndScan(), 300);
        }
      } else if (result.identified) {
        if (lockStateRef.current !== "locked") {
          lastResultRef.current = null;
          setLockState("scanning");
        }
        setStatusMsg(`Low confidence (${Math.round(conf * 100)}%) — hold steady`);
      } else {
        if (lockStateRef.current === "locked") {
          setStatusMsg("Locked · lost frame · reacquiring…");
        } else {
          lastResultRef.current = null;
          setLockState("scanning");
          setStatusMsg(result.reasoning || "Point at card · avoid glare");
        }
      }
    } catch (e: any) {
      if (lockStateRef.current !== "locked") {
        lastResultRef.current = null;
        setLockState("scanning");
      }
      setStatusMsg(e?.userMessage || "Scan failed");
    } finally {
      scanningRef.current = false;
      setScanning(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!settingsReady) return;
    const configured = settings.autoScanIntervalSec; // 0 = OFF
    if (!configured || !camPerm?.granted) return;
    // Increased minimum delay to 8s to avoid OpenAI rate limiting (429 errors)
    const ms = Math.max(configured * 1000, 8000);
    const t = setInterval(() => {
      captureAndScan();
    }, ms);
    return () => clearInterval(t);
  }, [settings.autoScanIntervalSec, camPerm?.granted, captureAndScan, settingsReady]);

  const onCameraReady = () => {
    cameraReadyRef.current = true;
    setTimeout(() => captureAndScan(), 1200);
  };

  // ---------- Voice interaction ----------
  const speakReply = async (audio_base64: string | null, replyText: string) => {
    setLastReply(replyText);
    if (!audio_base64) {
      setAssistantState("idle");
      return;
    }
    try {
      const uri = `data:audio/mpeg;base64,${audio_base64}`;
      setAssistantState("speaking");
      player.replace({ uri });
      player.play();
    } catch {
      setAssistantState("idle");
    }
  };

  useEffect(() => {
    const i = setInterval(() => {
      if (assistantState === "speaking" && player && !player.playing && player.currentTime > 0) {
        setAssistantState("idle");
      }
    }, 400);
    return () => clearInterval(i);
  }, [assistantState, player]);

  const startListening = async () => {
    if (!settings.voiceEnabled) return;
    if (!micGranted) {
      const mic = await requestRecordingPermissionsAsync();
      if (!mic.granted) return;
      setMicGranted(true);
    }
    if (assistantState === "speaking") {
      try {
        player.pause();
      } catch {}
    }
    try {
      if (settings.hapticsEnabled) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
      await recorder.prepareToRecordAsync();
      recorder.record();
      setAssistantState("listening");
    } catch {
      setAssistantState("idle");
    }
  };

  const stopListeningAndSend = async () => {
    if (assistantState !== "listening") return;
    setAssistantState("thinking");
    try {
      await recorder.stop();
      const uri = recorder.uri;
      if (!uri) {
        setAssistantState("idle");
        return;
      }
      const text = await transcribeAudio(uri, "audio/m4a");
      if (!text.trim()) {
        setAssistantState("idle");
        return;
      }
      setLastUserText(text);
      const ctx = cardRef.current?.identified ? cardRef.current : null;
      const { reply, audio_base64 } = await voiceChat(text, ctx, settings.ttsVoice);
      await speakReply(audio_base64, reply);
    } catch {
      setAssistantState("idle");
    }
  };

  const cardKey = (c: CardInfo | null) =>
    c ? `${c.name || ""}|${c.set_name || ""}|${c.number || ""}` : "";

  const onAddToCollection = async () => {
    if (!card?.identified || !card.name) return;
    const key = cardKey(card);
    if (addedIds.has(key)) return;
    try {
      if (settings.hapticsEnabled) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }
      await addToCollection({
        name: card.name,
        set_name: card.set_name,
        number: card.number,
        rarity: card.rarity,
        language: card.language,
        image_url: card.image_url,
        price_market: card.price.market ?? card.price.mid ?? null,
      });
      setAddedIds((prev) => new Set(prev).add(key));
    } catch {
      // silent — could show a toast in future
    }
  };

  const captureFrameForGrade = useCallback(async (): Promise<string | null> => {
    // Prefer the most recent scan capture (already downscaled). Fallback to a fresh capture.
    if (lastCaptureBase64Ref.current) return lastCaptureBase64Ref.current;
    if (!cameraReadyRef.current || !cameraRef.current) return null;
    try {
      const pic = await cameraRef.current.takePictureAsync({
        base64: true,
        quality: 0.6,
        skipProcessing: true,
        shutterSound: false,
      } as any);
      if (!pic?.base64 || !pic?.uri) return null;
      try {
        const resized = await ImageManipulator.manipulateAsync(
          pic.uri,
          [{ resize: { width: 900 } }],
          { compress: 0.75, format: ImageManipulator.SaveFormat.JPEG, base64: true },
        );
        return resized.base64 || pic.base64;
      } catch {
        return pic.base64;
      }
    } catch {
      return null;
    }
  }, []);

  // ---------- Render ----------
  if (!camPerm) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.brand} />
      </View>
    );
  }

  if (!camPerm.granted) {
    return (
      <View style={styles.center}>
        <Ionicons name="camera-outline" size={48} color={colors.brand} />
        <Text style={styles.permTitle}>Camera Access Required</Text>
        <Text style={styles.permSub}>Grant camera access to identify Pokémon cards.</Text>
        <Pressable testID="grant-camera-btn" style={styles.primaryBtn} onPress={requestCamPerm}>
          <Text style={styles.primaryBtnText}>GRANT CAMERA</Text>
        </Pressable>
      </View>
    );
  }

  const assistantColor =
    assistantState === "listening"
      ? colors.error
      : assistantState === "thinking"
      ? colors.warning
      : assistantState === "speaking"
      ? colors.success
      : colors.brand;

  const assistantLabel =
    assistantState === "listening"
      ? "LISTENING…"
      : assistantState === "thinking"
      ? "THINKING…"
      : assistantState === "speaking"
      ? "SPEAKING…"
      : settings.voiceEnabled
      ? "HOLD TO ASK"
      : "VOICE OFF";

  const autoScanActive = !!settings.autoScanIntervalSec;

  return (
    <View style={styles.root} testID="scanner-screen">
      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        facing="back"
        onCameraReady={onCameraReady}
      />

      {/* Top voice pill (press-and-hold to record) */}
      <View style={[styles.topPillWrap, { paddingTop: insets.top + spacing.sm }]} pointerEvents="box-none">
        {lockState === "locked" ? (
          <View style={styles.lockBadge} testID="lock-badge">
            <View style={[styles.lockDot, { backgroundColor: colors.success }]} />
            <Text style={styles.lockText}>LOCKED</Text>
          </View>
        ) : null}
        {settings.batchMode ? (
          <View style={styles.batchStrip} testID="batch-strip">
            <View style={styles.batchInfo}>
              <Text style={styles.batchLabel}>SESSION</Text>
              <Text style={styles.batchValue}>${batchTotal.toFixed(2)}</Text>
              <Text style={styles.batchCount}>{batchCount} card{batchCount === 1 ? "" : "s"}</Text>
            </View>
            <Pressable
              testID="batch-reset-btn"
              onPress={() => {
                setBatchTotal(0);
                setBatchCount(0);
              }}
              style={styles.batchReset}
            >
              <Ionicons name="refresh" size={12} color={colors.onSurface} />
            </Pressable>
          </View>
        ) : null}
        <Pressable
          testID="voice-pill-btn"
          onPressIn={startListening}
          onPressOut={stopListeningAndSend}
          disabled={!settings.voiceEnabled}
          hitSlop={8}
        >
          <BlurView
            intensity={60}
            tint="dark"
            style={[
              styles.voicePill,
              assistantState === "listening" && { borderColor: colors.error },
              !settings.voiceEnabled && { opacity: 0.5 },
            ]}
          >
            <View style={[styles.voiceDot, { backgroundColor: assistantColor }]} />
            <Text style={styles.voicePillText} testID="assistant-state-label">
              {assistantLabel}
            </Text>
            <Ionicons
              name={settings.voiceEnabled ? "mic" : "mic-off-outline"}
              size={16}
              color={settings.voiceEnabled ? colors.brand : colors.onSurfaceTertiary}
              style={{ marginLeft: 8 }}
            />
          </BlurView>
        </Pressable>
        
        {/* Status message below voice pill */}
        <View style={styles.statusBadge} pointerEvents="none">
          {scanning && <ActivityIndicator size="small" color={colors.brand} />}
          <Text style={styles.statusText} testID="scan-status">
            {statusMsg}
          </Text>
        </View>
      </View>

      {/* Reticle — temporarily disabled for crystal clear 4K quality */}
      {/* <ReticleAnim scanning={scanning} pulse={pulseTick > 0} lockState={lockState} /> */}

      {/* Side controls */}
      <View style={[styles.sideControls, { top: insets.top + 80 }]}>
        <Pressable testID="manual-scan-btn" onPress={() => captureAndScan()} style={styles.iconBtn}>
          <Ionicons name="scan" size={22} color={colors.onSurface} />
        </Pressable>
        <View
          testID="auto-scan-indicator"
          style={[styles.iconBtn, autoScanActive && styles.iconBtnActive]}
        >
          <Ionicons
            name={autoScanActive ? "sync" : "sync-outline"}
            size={22}
            color={autoScanActive ? colors.brand : colors.onSurfaceTertiary}
          />
        </View>
      </View>

      {/* Bottom info panel, flush to tab bar */}
      <View style={[styles.bottomWrap, { paddingBottom: insets.bottom }]} pointerEvents="box-none">
        {lastUserText || lastReply ? (
          <BlurView intensity={60} tint="dark" style={styles.transcriptCard}>
            {lastUserText ? (
              <Text style={styles.transcriptYou} testID="last-user-text" numberOfLines={2}>
                YOU: {lastUserText}
              </Text>
            ) : null}
            {lastReply ? (
              <Text style={styles.transcriptAi} testID="last-reply-text" numberOfLines={4}>
                AI: {lastReply}
              </Text>
            ) : null}
          </BlurView>
        ) : null}

        <BlurView intensity={80} tint="dark" style={styles.cardPanel}>
          {card?.identified ? (
            <Pressable
              testID="card-panel-open"
              onPress={() =>
                setDetail({
                  name: card.name || "",
                  set_name: card.set_name,
                  number: card.number,
                  rarity: card.rarity,
                  language: card.language,
                  image_url: card.image_url,
                  price_market: card.price.market,
                  price_low: card.price.low,
                  price_mid: card.price.mid,
                  price_high: card.price.high,
                })
              }
            >
              <View style={styles.cardHeaderRow}>
                {card.image_url ? (
                  <Image
                    source={{ uri: card.image_url }}
                    style={styles.cardThumb}
                    contentFit="cover"
                  />
                ) : (
                  <View style={[styles.cardThumb, styles.cardThumbEmpty]}>
                    <Ionicons name="image-outline" size={22} color={colors.onSurfaceTertiary} />
                  </View>
                )}
                <View style={{ flex: 1, marginLeft: spacing.md }}>
                  <Text style={styles.cardName} numberOfLines={1} testID="card-name">
                    {card.name}
                  </Text>
                  <Text style={styles.cardMeta} numberOfLines={1}>
                    {[card.set_name, card.number].filter(Boolean).join(" · ") || "Unknown set"}
                  </Text>
                  <View style={styles.chipRow}>
                    {card.language && card.language !== "english" ? (
                      <View style={[styles.chip, styles.chipLang]}>
                        <Text style={styles.chipText}>
                          {card.language === "japanese" ? "JP" : card.language.toUpperCase()}
                        </Text>
                      </View>
                    ) : null}
                    {card.rarity ? (
                      <View style={styles.chip}>
                        <Text style={styles.chipText}>{card.rarity}</Text>
                      </View>
                    ) : null}
                    {card.hp ? (
                      <View style={styles.chip}>
                        <Text style={styles.chipText}>{card.hp} HP</Text>
                      </View>
                    ) : null}
                    {card.confidence != null ? (
                      <View style={styles.chip}>
                        <Text style={styles.chipText}>
                          {Math.round((card.confidence || 0) * 100)}%
                        </Text>
                      </View>
                    ) : null}
                    {card.reasoning && /printing not/i.test(card.reasoning) ? (
                      <View style={[styles.chip, styles.chipWarn]} testID="printing-warn-chip">
                        <Text style={[styles.chipText, styles.chipWarnText]}>
                          UNCONFIRMED PRINTING
                        </Text>
                      </View>
                    ) : null}
                    {card.price_source && /approximate/i.test(card.price_source) ? (
                      <View style={[styles.chip, styles.chipApprox]} testID="approx-price-chip">
                        <Text style={[styles.chipText, styles.chipApproxText]}>
                          APPROX PRICE
                        </Text>
                      </View>
                    ) : null}
                  </View>
                </View>
              </View>

              {card.price.market != null ? (
                <View style={styles.priceRow}>
                  <View style={styles.priceMain}>
                    <Text style={styles.priceLabel}>MARKET</Text>
                    <Text style={styles.priceBig} testID="price-market">
                      {formatPrice(card.price.market ?? card.price.mid)}
                    </Text>
                  </View>
                  <View style={styles.priceBreakdown}>
                    <PriceCell label="LOW" value={card.price.low} />
                    <PriceCell label="MID" value={card.price.mid} />
                    <PriceCell label="HIGH" value={card.price.high} />
                  </View>
                </View>
              ) : (
                <Text style={styles.noPrice} testID="no-price-msg">
                  {card.reasoning || "No live price data available"}
                </Text>
              )}
              {card.price_source && card.price.market != null ? (
                <Text style={styles.priceSource} testID="price-source">
                  {card.price_source}
                </Text>
              ) : null}
              {card.ambiguous && (card.candidates?.length || 0) > 0 ? (
                <View style={styles.altBlock} testID="ambiguous-block">
                  <Text style={styles.altHeader}>
                    {card.price_source && /approximate/i.test(card.price_source)
                      ? "Pick the exact set for a confirmed price:"
                      : "Same # exists in other sets — pick the correct printing:"}
                  </Text>
                  <View style={styles.altList}>
                    {card.candidates!.map((c, i) => (
                      <Pressable
                        key={`${c.set_name}-${c.number}-${i}`}
                        testID={`alt-candidate-${i}`}
                        onPress={async (e) => {
                          e.stopPropagation?.();
                          try {
                            const picked = await pickCandidate({
                              name: c.name,
                              set_name: c.set_name || "",
                              number: c.number || "",
                              language: card.language || "english",
                            });
                            setCard(picked);
                          } catch {}
                        }}
                        style={styles.altItem}
                      >
                        <Text style={styles.altItemSet} numberOfLines={1}>
                          {c.set_name || "Unknown set"}
                        </Text>
                        <Text style={styles.altItemPrice}>
                          {c.price_market != null ? `$${c.price_market.toFixed(2)}` : "—"}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              ) : null}
              {(() => {
                const added = addedIds.has(cardKey(card));
                return (
                  <View style={styles.cardActions}>
                    <Pressable
                      testID="rescan-btn"
                      onPress={(e) => {
                        e.stopPropagation?.();
                        lastResultRef.current = null;
                        setCard(null);
                        setLockState("scanning");
                        setStatusMsg("Rescanning…");
                        captureAndScan();
                      }}
                      style={styles.rescanBtn}
                    >
                      <Ionicons name="refresh" size={16} color={colors.onSurface} />
                      <Text style={styles.rescanBtnText}>RESCAN</Text>
                    </Pressable>
                    <Pressable
                      testID="add-to-collection-btn"
                      onPress={(e) => {
                        e.stopPropagation?.();
                        onAddToCollection();
                      }}
                      disabled={added}
                      style={[styles.addBtn, styles.addBtnFlex, added && styles.addBtnAdded]}
                    >
                      <Ionicons
                        name={added ? "checkmark-circle" : "add-circle-outline"}
                        size={18}
                        color={added ? colors.success : colors.onBrand}
                      />
                      <Text style={[styles.addBtnText, added && styles.addBtnTextAdded]}>
                        {added ? "IN COLLECTION" : "ADD TO COLLECTION"}
                      </Text>
                    </Pressable>
                  </View>
                );
              })()}
              <Pressable
                testID="wrong-card-btn"
                onPress={(e) => {
                  e.stopPropagation?.();
                  setManualSearchOpen(true);
                }}
                style={styles.wrongCardBtn}
              >
                <Ionicons name="search-outline" size={13} color={colors.onSurfaceSecondary} />
                <Text style={styles.wrongCardBtnText}>Wrong card? Search manually</Text>
              </Pressable>
            </Pressable>
          ) : (
            <View style={styles.emptyCard}>
              <Ionicons name="card-outline" size={26} color={colors.brand} />
              <Text style={styles.emptyCardTitle}>Awaiting Card…</Text>
              <Text style={styles.emptyCardSub}>Center a Pokémon card inside the frame</Text>
            </View>
          )}
        </BlurView>
      </View>
      <Tutorial visible={showTutorial} onDone={closeTutorial} />
      <CardDetailSheet
        visible={!!detail}
        card={detail}
        onClose={() => setDetail(null)}
        onCaptureForGrade={captureFrameForGrade}
      />
    </View>
  );
}

function PriceCell({ label, value }: { label: string; value: number | null | undefined }) {
  return (
    <View style={styles.priceCell}>
      <Text style={styles.priceCellLabel}>{label}</Text>
      <Text style={styles.priceCellValue}>{formatPrice(value)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  center: {
    flex: 1,
    backgroundColor: "#000",
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
  },
  permTitle: {
    color: colors.onSurface,
    fontSize: 20,
    fontWeight: "700",
    marginTop: spacing.lg,
    letterSpacing: 0.5,
  },
  permSub: {
    color: colors.onSurfaceSecondary,
    fontSize: 14,
    marginTop: spacing.sm,
    textAlign: "center",
  },
  primaryBtn: {
    marginTop: spacing.xl,
    backgroundColor: colors.brand,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
  },
  primaryBtnText: { color: colors.onBrand, fontWeight: "800", letterSpacing: 1 },

  topPillWrap: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    alignItems: "center",
    gap: 8,
  },
  lockBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: "rgba(62,224,180,0.15)",
    borderWidth: 1,
    borderColor: colors.success,
  },
  lockDot: { width: 6, height: 6, borderRadius: 3 },
  lockText: {
    color: colors.success,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.4,
  },
  voicePill: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    borderRadius: radius.pill,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  voiceDot: { width: 8, height: 8, borderRadius: 4, marginRight: 8 },
  voicePillText: {
    color: colors.onSurface,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.2,
  },

  reticleWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 60,
    paddingBottom: 340,
  },
  reticle: { width: 240, height: 336, position: "relative" },
  corner: {
    position: "absolute",
    width: 32,
    height: 32,
    borderColor: colors.brand,
  },
  tl: { top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3 },
  tr: { top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3 },
  bl: { bottom: 0, left: 0, borderBottomWidth: 3, borderLeftWidth: 3 },
  br: { bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3 },
  statusWrap: {
    position: "absolute",
    top: "50%",
    left: 0,
    right: 0,
    marginTop: 180,
    alignItems: "center",
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(0,0,0,0.55)",
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statusText: {
    color: colors.onSurface,
    fontSize: 12,
    letterSpacing: 0.8,
    fontWeight: "600",
    marginLeft: 6,
  },

  sideControls: {
    position: "absolute",
    right: spacing.md,
    gap: spacing.sm,
  },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  iconBtnActive: {
    borderColor: colors.brand,
    backgroundColor: colors.brandTertiary,
  },

  bottomWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  transcriptCard: {
    padding: spacing.md,
    borderRadius: radius.lg,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  transcriptYou: {
    color: colors.onSurfaceSecondary,
    fontSize: 12,
    marginBottom: 4,
  },
  transcriptAi: { color: colors.onSurface, fontSize: 13, lineHeight: 18 },

  cardPanel: {
    padding: spacing.lg,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    borderBottomWidth: 0,
  },
  cardHeaderRow: { flexDirection: "row", alignItems: "center" },
  cardThumb: {
    width: 60,
    height: 84,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceTertiary,
  },
  cardThumbEmpty: { alignItems: "center", justifyContent: "center" },
  cardName: { color: colors.onSurface, fontSize: 22, fontWeight: "800", letterSpacing: 0.3 },
  cardMeta: { color: colors.onSurfaceSecondary, fontSize: 12, marginTop: 2 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", marginTop: 6, gap: 6 },
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
  chipWarn: {
    backgroundColor: colors.surfaceTertiary,
    borderWidth: 1,
    borderColor: colors.warning,
  },
  chipWarnText: { color: colors.warning },
  chipApprox: {
    backgroundColor: colors.surfaceTertiary,
    borderWidth: 1,
    borderColor: colors.brand,
  },
  chipApproxText: { color: colors.brand },
  chipText: { color: colors.onBrandTertiary, fontSize: 10, fontWeight: "700", letterSpacing: 0.5 },

  priceRow: {
    marginTop: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  priceMain: {},
  priceLabel: {
    color: colors.onSurfaceTertiary,
    fontSize: 10,
    letterSpacing: 1.5,
    fontWeight: "700",
  },
  priceBig: {
    color: colors.brand,
    fontSize: 38,
    fontWeight: "900",
    letterSpacing: -0.5,
    marginTop: 2,
  },
  priceBreakdown: { flexDirection: "row", gap: spacing.md },
  priceCell: { alignItems: "flex-end" },
  priceCellLabel: {
    color: colors.onSurfaceTertiary,
    fontSize: 9,
    letterSpacing: 1.2,
    fontWeight: "700",
  },
  priceCellValue: { color: colors.onSurface, fontSize: 14, fontWeight: "700", marginTop: 2 },

  noPrice: {
    color: colors.onSurfaceSecondary,
    fontSize: 12,
    marginTop: spacing.sm,
    fontStyle: "italic",
    lineHeight: 17,
  },
  priceSource: {
    color: colors.onSurfaceTertiary,
    fontSize: 10,
    marginTop: spacing.sm,
    letterSpacing: 0.6,
    fontWeight: "600",
  },

  emptyCard: { alignItems: "center", paddingVertical: spacing.sm },
  emptyCardTitle: {
    color: colors.onSurface,
    fontSize: 16,
    fontWeight: "700",
    marginTop: 6,
    letterSpacing: 0.5,
  },
  emptyCardSub: { color: colors.onSurfaceSecondary, fontSize: 12, marginTop: 2 },

  addBtn: {
    marginTop: spacing.md,
    backgroundColor: colors.brand,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: radius.md,
  },
  addBtnFlex: { flex: 1, marginTop: 0 },
  addBtnAdded: {
    backgroundColor: colors.surfaceTertiary,
    borderWidth: 1,
    borderColor: colors.success,
  },
  addBtnText: {
    color: colors.onBrand,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1.2,
  },
  addBtnTextAdded: { color: colors.success },
  cardActions: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  rescanBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  rescanBtnText: {
    color: colors.onSurface,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1,
  },
  thumbStack: { position: "relative" },
  scannedPip: {
    position: "absolute",
    top: -6,
    right: -6,
    width: 40,
    height: 56,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: colors.brand,
    overflow: "hidden",
    backgroundColor: colors.surface,
  },
  scannedPipImg: { width: "100%", height: "100%" },
  scannedPipLabel: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    fontSize: 7,
    fontWeight: "800",
    color: colors.onSurface,
    backgroundColor: "rgba(5,9,21,0.85)",
    textAlign: "center",
    letterSpacing: 0.6,
  },
  batchStrip: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.md,
    backgroundColor: colors.brandTertiary,
    borderWidth: 1,
    borderColor: colors.brandSecondary,
  },
  batchInfo: { flexDirection: "row", alignItems: "baseline", gap: 6 },
  batchLabel: {
    color: colors.onBrandTertiary,
    fontSize: 9,
    letterSpacing: 1.2,
    fontWeight: "800",
  },
  batchValue: {
    color: colors.brand,
    fontSize: 14,
    fontWeight: "900",
  },
  batchCount: { color: colors.onSurfaceSecondary, fontSize: 10, fontWeight: "600" },
  batchReset: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  altBlock: {
    marginTop: spacing.md,
    padding: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceTertiary,
    borderWidth: 1,
    borderColor: colors.warning,
  },
  altHeader: {
    color: colors.warning,
    fontSize: 11,
    fontWeight: "700",
    marginBottom: 6,
  },
  altList: { gap: 4 },
  altItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  altItemSet: {
    color: colors.onSurface,
    fontSize: 12,
    fontWeight: "600",
    flex: 1,
    marginRight: 8,
  },
  altItemPrice: {
    color: colors.brand,
    fontSize: 12,
    fontWeight: "800",
  },
});
