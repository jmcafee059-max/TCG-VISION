import { useCallback, useEffect, useState } from "react";
import { storage } from "@/src/utils/storage";

export type AppSettings = {
  autoScanIntervalSec: number; // 0 = off
  voiceEnabled: boolean;
  ttsVoice: "nova" | "alloy" | "echo" | "onyx" | "shimmer" | "sage" | "fable";
  confidenceThresholdPct: number; // 40..90
  hapticsEnabled: boolean;
  announceOnLock: boolean; // auto-TTS card name + price when locked
  batchMode: boolean; // running session total
};

export const DEFAULT_SETTINGS: AppSettings = {
  autoScanIntervalSec: 3,
  voiceEnabled: true,
  ttsVoice: "nova",
  confidenceThresholdPct: 40,
  hapticsEnabled: true,
  announceOnLock: false,
  batchMode: false,
};

const KEY = "app_settings_v3"; // bumped for new fields

async function loadSettings(): Promise<AppSettings> {
  const raw = await storage.getItem<string>(KEY, "");
  if (!raw) return { ...DEFAULT_SETTINGS };
  try {
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

async function saveSettings(s: AppSettings) {
  await storage.setItem(KEY, JSON.stringify(s));
}

// Lightweight subscriber pattern so Scanner sees updates when Settings changes.
type Listener = (s: AppSettings) => void;
const listeners = new Set<Listener>();
let current: AppSettings = { ...DEFAULT_SETTINGS };
let loaded = false;

async function ensureLoaded() {
  if (loaded) return;
  current = await loadSettings();
  loaded = true;
}

export function useSettings() {
  const [settings, setSettings] = useState<AppSettings>(current);
  const [ready, setReady] = useState(loaded);

  useEffect(() => {
    let alive = true;
    (async () => {
      await ensureLoaded();
      if (!alive) return;
      setSettings(current);
      setReady(true);
    })();
    const l: Listener = (s) => setSettings(s);
    listeners.add(l);
    return () => {
      alive = false;
      listeners.delete(l);
    };
  }, []);

  const update = useCallback(async (patch: Partial<AppSettings>) => {
    current = { ...current, ...patch };
    setSettings(current);
    await saveSettings(current);
    listeners.forEach((l) => l(current));
  }, []);

  return { settings, update, ready };
}
