import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Linking,
  Pressable,
  Switch,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius, spacing } from "@/src/theme";
import { storage } from "@/src/utils/storage";
import { useSettings, AppSettings } from "@/src/lib/settings";
import Tutorial from "@/src/components/Tutorial";

const INTERVAL_OPTIONS: { label: string; value: number }[] = [
  { label: "OFF", value: 0 },
  { label: "3s", value: 3 },
  { label: "5s", value: 5 },
  { label: "10s", value: 10 },
];

const VOICE_OPTIONS: AppSettings["ttsVoice"][] = [
  "nova",
  "alloy",
  "echo",
  "onyx",
  "shimmer",
  "sage",
  "fable",
];

const CONFIDENCE_OPTIONS = [30, 40, 55, 70];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.card}>{children}</View>
    </View>
  );
}

function InfoRow({
  icon,
  label,
  value,
  onPress,
}: {
  icon: any;
  label: string;
  value?: string;
  onPress?: () => void;
}) {
  const Cmp: any = onPress ? Pressable : View;
  return (
    <Cmp style={styles.row} onPress={onPress}>
      <Ionicons name={icon} size={18} color={colors.brand} />
      <Text style={styles.rowLabel}>{label}</Text>
      {value ? <Text style={styles.rowValue}>{value}</Text> : null}
      {onPress ? <Ionicons name="chevron-forward" size={16} color={colors.onSurfaceTertiary} /> : null}
    </Cmp>
  );
}

function SegRow({
  icon,
  label,
  options,
  value,
  onChange,
  testID,
}: {
  icon: any;
  label: string;
  options: { label: string; value: any }[];
  value: any;
  onChange: (v: any) => void;
  testID?: string;
}) {
  return (
    <View style={styles.segRow}>
      <View style={styles.segLabelRow}>
        <Ionicons name={icon} size={18} color={colors.brand} />
        <Text style={styles.rowLabel}>{label}</Text>
      </View>
      <View style={styles.segGroup} testID={testID}>
        {options.map((o) => {
          const active = o.value === value;
          return (
            <Pressable
              key={String(o.value)}
              testID={`${testID}-${o.value}`}
              onPress={() => onChange(o.value)}
              style={[styles.segBtn, active && styles.segBtnActive]}
            >
              <Text style={[styles.segBtnText, active && styles.segBtnTextActive]}>
                {o.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function SwitchRow({
  icon,
  label,
  value,
  onChange,
  testID,
}: {
  icon: any;
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
  testID?: string;
}) {
  return (
    <View style={styles.row}>
      <Ionicons name={icon} size={18} color={colors.brand} />
      <Text style={styles.rowLabel}>{label}</Text>
      <Switch
        testID={testID}
        value={value}
        onValueChange={onChange}
        trackColor={{ true: colors.brand, false: colors.borderStrong }}
        thumbColor={colors.onSurface}
      />
    </View>
  );
}

export default function SettingsScreen() {
  const { settings, update, ready } = useSettings();
  const [showTutorial, setShowTutorial] = useState(false);
  const openTutorial = useCallback(() => setShowTutorial(true), []);
  const closeTutorial = useCallback(async () => {
    setShowTutorial(false);
    await storage.setItem("tutorial_seen", true);
  }, []);

  if (!ready) {
    return <View style={styles.root} />;
  }

  return (
    <SafeAreaView style={styles.root} edges={["top"]} testID="settings-screen">
      <View style={styles.header}>
        <Text style={styles.hTitle}>SETTINGS</Text>
        <Text style={styles.hSub}>Tap to change · saved automatically</Text>
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: 140 }}>
        <Section title="SCANNER">
          <SegRow
            icon="scan-outline"
            label="Auto-scan"
            options={INTERVAL_OPTIONS}
            value={settings.autoScanIntervalSec}
            onChange={(v) => update({ autoScanIntervalSec: v })}
            testID="auto-scan-seg"
          />
          <View style={styles.rowSep} />
          <SegRow
            icon="shield-checkmark-outline"
            label="Min confidence"
            options={CONFIDENCE_OPTIONS.map((v) => ({ label: `${v}%`, value: v }))}
            value={settings.confidenceThresholdPct}
            onChange={(v) => update({ confidenceThresholdPct: v })}
            testID="confidence-seg"
          />
          <View style={styles.rowSep} />
          <SwitchRow
            icon="phone-portrait-outline"
            label="Haptics"
            value={settings.hapticsEnabled}
            onChange={(v) => update({ hapticsEnabled: v })}
            testID="haptics-switch"
          />
          <View style={styles.rowSep} />
          <InfoRow icon="help-circle-outline" label="Show tutorial" onPress={openTutorial} />
        </Section>

        <Section title="VOICE ASSISTANT">
          <SwitchRow
            icon="mic-outline"
            label="Voice enabled"
            value={settings.voiceEnabled}
            onChange={(v) => update({ voiceEnabled: v })}
            testID="voice-enabled-switch"
          />
          <View style={styles.rowSep} />
          <SwitchRow
            icon="megaphone-outline"
            label="Announce card on lock"
            value={settings.announceOnLock}
            onChange={(v) => update({ announceOnLock: v })}
            testID="announce-lock-switch"
          />
          <View style={styles.rowSep} />
          <SegRow
            icon="musical-notes-outline"
            label="TTS voice"
            options={VOICE_OPTIONS.map((v) => ({ label: v.toUpperCase(), value: v }))}
            value={settings.ttsVoice}
            onChange={(v) => update({ ttsVoice: v })}
            testID="tts-voice-seg"
          />
        </Section>

        <Section title="BATCH MODE">
          <SwitchRow
            icon="stats-chart-outline"
            label="Session batch counter"
            value={settings.batchMode}
            onChange={(v) => update({ batchMode: v })}
            testID="batch-mode-switch"
          />
        </Section>

        <Section title="MODELS & DATA">
          <InfoRow icon="eye-outline" label="Vision model" value="Claude Sonnet 4.5" />
          <View style={styles.rowSep} />
          <InfoRow icon="chatbubble-ellipses-outline" label="Chat model" value="GPT-5.2" />
          <View style={styles.rowSep} />
          <InfoRow icon="server-outline" label="Price source" value="JustTCG (EN + JP)" />
          <View style={styles.rowSep} />
          <InfoRow
            icon="link-outline"
            label="Open JustTCG"
            onPress={() => Linking.openURL("https://justtcg.com")}
          />
        </Section>

        <Section title="ABOUT">
          <InfoRow icon="information-circle-outline" label="Version" value="1.1.0" />
          <View style={styles.rowSep} />
          <InfoRow icon="sparkles-outline" label="Built with Emergent" />
        </Section>

        <Text style={styles.footer}>
          All settings save automatically. Confidence threshold gates weak identifications; keep at 55% for
          a balance of speed and accuracy.
        </Text>
      </ScrollView>
      <Tutorial visible={showTutorial} onDone={closeTutorial} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  hTitle: { color: colors.onSurface, fontSize: 26, fontWeight: "900", letterSpacing: 1 },
  hSub: { color: colors.onSurfaceSecondary, fontSize: 12, marginTop: 2 },
  section: { marginTop: spacing.lg, paddingHorizontal: spacing.lg },
  sectionTitle: {
    color: colors.onSurfaceTertiary,
    fontSize: 11,
    letterSpacing: 1.5,
    fontWeight: "700",
    marginBottom: spacing.sm,
  },
  card: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
  },
  rowLabel: { color: colors.onSurface, fontSize: 14, flex: 1, marginLeft: spacing.md },
  rowValue: { color: colors.onSurfaceSecondary, fontSize: 13, marginRight: 4 },
  rowSep: { height: 1, backgroundColor: colors.divider, marginLeft: spacing.md + 18 + spacing.md },

  segRow: {
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
  },
  segLabelRow: { flexDirection: "row", alignItems: "center" },
  segGroup: {
    flexDirection: "row",
    gap: 6,
    marginTop: 10,
    marginLeft: 18 + spacing.md,
    flexWrap: "wrap",
  },
  segBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceTertiary,
    borderWidth: 1,
    borderColor: colors.border,
    minWidth: 44,
    alignItems: "center",
  },
  segBtnActive: {
    backgroundColor: colors.brand,
    borderColor: colors.brand,
  },
  segBtnText: {
    color: colors.onSurfaceSecondary,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.6,
  },
  segBtnTextActive: { color: colors.onBrand },

  footer: {
    color: colors.onSurfaceTertiary,
    fontSize: 12,
    marginTop: spacing.xl,
    marginHorizontal: spacing.lg,
    lineHeight: 18,
  },
});
