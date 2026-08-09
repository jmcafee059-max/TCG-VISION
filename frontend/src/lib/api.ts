import Constants from "expo-constants";

const BACKEND_URL =
  process.env.EXPO_PUBLIC_BACKEND_URL ||
  (Constants.expoConfig?.extra as any)?.EXPO_PUBLIC_BACKEND_URL ||
  "";

export const API_BASE = `${BACKEND_URL}/api`;

export type CardInfo = {
  id: string;
  identified: boolean;
  name?: string | null;
  set_name?: string | null;
  number?: string | null;
  rarity?: string | null;
  hp?: string | null;
  language?: string | null;
  image_url?: string | null;
  price: { low?: number | null; mid?: number | null; high?: number | null; market?: number | null };
  currency: string;
  price_source?: string | null;
  tcgplayer_url?: string | null;
  confidence?: number | null;
  reasoning?: string | null;
  scanned_at: string;
  ambiguous?: boolean;
  candidates?: {
    name: string;
    set_name?: string | null;
    number?: string | null;
    rarity?: string | null;
    image_url?: string | null;
    price_market?: number | null;
    just_id?: string | null;
  }[];
};

export async function scanCard(imageBase64: string): Promise<CardInfo> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45000); // 45s hard cap
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/scan-card`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image_base64: imageBase64 }),
      signal: controller.signal,
    });
  } catch (e: any) {
    clearTimeout(timer);
    if (e?.name === "AbortError") {
      const err: any = new Error("scan_timeout");
      err.userMessage = "Scan timed out — check connection and try again.";
      throw err;
    }
    throw e;
  }
  clearTimeout(timer);
  if (!res.ok) {
    let detail = "";
    try {
      const j = await res.json();
      detail = (j && (j.detail || j.error)) || "";
    } catch {}
    if (res.status === 402 || /budget/i.test(detail)) {
      const err: any = new Error("budget_exceeded");
      err.code = "budget_exceeded";
      err.userMessage =
        "AI credit budget exhausted. Add balance in Profile → Universal Key to keep scanning.";
      throw err;
    }
    const err: any = new Error(`scan-card ${res.status}: ${detail}`);
    err.userMessage = "Scan failed — check connection.";
    throw err;
  }
  return res.json();
}

export async function pickCandidate(payload: {
  name: string;
  set_name: string;
  number: string;
  language?: string;
}): Promise<CardInfo> {
  const res = await fetch(`${API_BASE}/scan-card/pick`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`pick ${res.status}`);
  return res.json();
}

export type SearchResult = {
  name: string;
  set_name?: string | null;
  number?: string | null;
  rarity?: string | null;
  price_market?: number | null;
  just_id?: string | null;
};

export async function searchCards(
  query: string,
  language: "english" | "japanese" = "english",
): Promise<SearchResult[]> {
  const res = await fetch(`${API_BASE}/scan-card/search`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, language }),
  });
  if (!res.ok) throw new Error(`search ${res.status}`);
  const data = await res.json();
  return (data?.results as SearchResult[]) || [];
}

export async function fetchHistory(): Promise<CardInfo[]> {
  const res = await fetch(`${API_BASE}/history`);
  if (!res.ok) throw new Error(`history ${res.status}`);
  return res.json();
}

export async function clearHistory() {
  await fetch(`${API_BASE}/history`, { method: "DELETE" });
}

// ---- Collection ----
export type CollectionItem = {
  id: string;
  name: string;
  set_name?: string | null;
  number?: string | null;
  number_int?: number | null;
  total_in_set?: number | null;
  rarity?: string | null;
  language?: string | null;
  image_url?: string | null;
  price_market?: number | null;
  currency: string;
  added_at: string;
};

export type CollectionSetGroup = {
  set_name: string;
  count: number;
  total_value: number;
  items: CollectionItem[];
};

export type CollectionSummary = {
  total_cards: number;
  total_value: number;
  by_set: CollectionSetGroup[];
  all_by_price: CollectionItem[];
};

export async function addToCollection(payload: {
  name: string;
  set_name?: string | null;
  number?: string | null;
  rarity?: string | null;
  language?: string | null;
  image_url?: string | null;
  price_market?: number | null;
}): Promise<CollectionItem> {
  const res = await fetch(`${API_BASE}/collection`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`collection add ${res.status}`);
  return res.json();
}

export async function getCollection(): Promise<CollectionSummary> {
  const res = await fetch(`${API_BASE}/collection`);
  if (!res.ok) throw new Error(`collection get ${res.status}`);
  return res.json();
}

export async function removeFromCollection(id: string) {
  await fetch(`${API_BASE}/collection/${id}`, { method: "DELETE" });
}

// ---- Graded prices ----
export type GradedPrice = { label: string; value?: number | null; note?: string | null };
export type GradedPricesResponse = {
  raw_nm?: number | null;
  raw_lp?: number | null;
  grades: GradedPrice[];
  disclaimer: string;
  source: string;
};

export async function fetchGradedPrices(payload: {
  name: string;
  set_name?: string | null;
  number?: string | null;
  rarity?: string | null;
  language?: string | null;
  raw_market?: number | null;
}): Promise<GradedPricesResponse> {
  const res = await fetch(`${API_BASE}/card/graded-prices`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    let detail = "";
    try {
      const j = await res.json();
      detail = j?.detail || "";
    } catch {}
    if (res.status === 402 || /budget/i.test(detail)) {
      const err: any = new Error("budget_exceeded");
      err.userMessage = "AI credit budget exhausted. Add balance in Profile → Universal Key.";
      throw err;
    }
    throw new Error(`graded ${res.status}`);
  }
  return res.json();
}

// ---- Grade estimate from image ----
export type GradeEstimate = {
  centering_pct?: number | null;
  centering?: string | null;
  corners_grade?: number | null;
  edges_grade?: number | null;
  surface_grade?: number | null;
  overall_grade?: number | null;
  overall_label?: string | null;
  notes?: string | null;
  disclaimer: string;
};

export async function estimateGrade(image_base64: string): Promise<GradeEstimate> {
  const res = await fetch(`${API_BASE}/card/grade-estimate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image_base64 }),
  });
  if (!res.ok) throw new Error(`grade-est ${res.status}`);
  return res.json();
}

export async function transcribeAudio(uri: string, mime: string = "audio/m4a"): Promise<string> {
  const form = new FormData();
  const filename = uri.split("/").pop() || "audio.m4a";
  // @ts-ignore RN FormData file
  form.append("file", { uri, name: filename, type: mime });
  const res = await fetch(`${API_BASE}/voice/transcribe`, { method: "POST", body: form as any });
  if (!res.ok) throw new Error(`transcribe ${res.status}`);
  const data = await res.json();
  return data.text || "";
}

export async function voiceChat(
  text: string,
  card_context: any | null,
  voice: string = "nova",
): Promise<{ reply: string; audio_base64: string | null }> {
  const res = await fetch(`${API_BASE}/voice/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, card_context, voice }),
  });
  if (!res.ok) throw new Error(`voice-chat ${res.status}`);
  return res.json();
}
