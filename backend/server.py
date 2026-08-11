import os
import io
import json
import base64
import logging
import tempfile
import uuid
import asyncio
from pathlib import Path
from datetime import datetime, timezone
from typing import List, Optional, Dict

import httpx
from fastapi import FastAPI, APIRouter, HTTPException, UploadFile, File
from fastapi.responses import JSONResponse
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
from pydantic import BaseModel, Field
from openai import AsyncOpenAI

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

# ---- Env ----
MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
# Prefer explicit LLM_API_KEY, but also allow common env var names.
LLM_API_KEY = (
    os.environ.get("LLM_API_KEY")
    or os.environ.get("OPENAI_API_KEY")
    or os.environ.get("OPENAI_KEY")
    or ""
)
JUSTTCG_API_KEY = os.environ.get("JUSTTCG_API_KEY", "")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger("tcg-vision")

# ---- Mongo ----
# MongoDB is not running - use in-memory storage instead
mongo_available = False
mongo_client = None
db = None
logger.warning("MongoDB disabled - using in-memory storage")

# In-memory storage (since MongoDB is not available)
# These are defined here to avoid circular references with models
_collection_memory = {}
_collection_lock = asyncio.Lock()
_history_memory = []
_history_lock = asyncio.Lock()
_scanned_sets = {}

# ---- OpenAI ----
from openai import AsyncOpenAI

# ---- FastAPI ----
app = FastAPI(title="TCG Vision Price Checker")
api = APIRouter(prefix="/api")

# ---- Models ----
class ScanRequest(BaseModel):
    image_base64: str

class CardPrice(BaseModel):
    low: Optional[float] = None
    mid: Optional[float] = None
    high: Optional[float] = None
    market: Optional[float] = None


class CollectionItem(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    set_name: Optional[str] = None
    number: Optional[str] = None
    number_int: Optional[int] = None  # for ordering in binder
    total_in_set: Optional[int] = None
    rarity: Optional[str] = None
    language: Optional[str] = None
    image_url: Optional[str] = None
    price_market: Optional[float] = None
    currency: str = "GBP"
    added_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class AddToCollectionRequest(BaseModel):
    name: str
    set_name: Optional[str] = None
    number: Optional[str] = None
    rarity: Optional[str] = None
    language: Optional[str] = None
    image_url: Optional[str] = None
    price_market: Optional[float] = None


class CollectionSetGroup(BaseModel):
    set_name: str
    count: int
    total_value: float
    items: List[CollectionItem]
    completion_percentage: Optional[float] = None  # Set completion percentage
    total_in_set: Optional[int] = None  # Total cards in the set


class CollectionSummary(BaseModel):
    total_cards: int
    total_value: float
    by_set: List[CollectionSetGroup]
    all_by_price: List[CollectionItem]
    most_expensive_card: Optional[CollectionItem] = None  # Single most expensive card


class CardCandidate(BaseModel):
    name: str
    set_name: Optional[str] = None
    number: Optional[str] = None
    rarity: Optional[str] = None
    image_url: Optional[str] = None
    price_market: Optional[float] = None
    just_id: Optional[str] = None  # JustTCG card id for later selection


class CardInfo(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    identified: bool
    name: Optional[str] = None
    set_name: Optional[str] = None
    number: Optional[str] = None
    rarity: Optional[str] = None
    hp: Optional[str] = None
    language: Optional[str] = None
    image_url: Optional[str] = None
    price: CardPrice = Field(default_factory=CardPrice)
    currency: str = "GBP"
    price_source: Optional[str] = None
    tcgplayer_url: Optional[str] = None
    confidence: Optional[float] = None
    reasoning: Optional[str] = None
    scanned_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    ambiguous: bool = False
    candidates: List[CardCandidate] = Field(default_factory=list)


class VoiceChatRequest(BaseModel):
    text: str
    card_context: Optional[dict] = None
    voice: Optional[str] = "nova"


class GradedPricesRequest(BaseModel):
    name: str
    set_name: Optional[str] = None
    number: Optional[str] = None
    rarity: Optional[str] = None
    language: Optional[str] = None
    raw_market: Optional[float] = None  # base raw NM price if we already have it


class GradedPrice(BaseModel):
    label: str
    value: Optional[float] = None
    note: Optional[str] = None


class GradedPricesResponse(BaseModel):
    raw_nm: Optional[float] = None
    raw_lp: Optional[float] = None
    grades: List[GradedPrice]
    disclaimer: str
    source: str


class GradeEstimateRequest(BaseModel):
    image_base64: str


class GradeEstimateResponse(BaseModel):
    centering_pct: Optional[float] = None
    centering: Optional[str] = None  # e.g. "55/45"
    corners_grade: Optional[float] = None
    edges_grade: Optional[float] = None
    surface_grade: Optional[float] = None
    overall_grade: Optional[float] = None
    overall_label: Optional[str] = None  # e.g. "PSA 8 (NM-MT)"
    notes: Optional[str] = None
    disclaimer: str


# ---- Vision identification ----
# Using OpenAI GPT-4 Turbo for vision with region-specific scanning

IDENTIFY_SYSTEM = (
    'You are a Pokemon TCG card identification expert. Your job is to identify cards from camera frames.\n'
    'Return ONLY valid JSON with this exact schema:\n'
    '{\n'
    ' "detected": true|false,\n'
    ' "language": "english"|"japanese"|"other",\n'
    ' "name_native": "the Pokemon name EXACTLY is printed at the top of the card (English or katakana/kanji)",\n'
    ' "name_english": "the OFFICIAL English Pokemon name matching the native name",\n'
    ' "set_hint": "EXACT set title printed on the card (e.g., \"Scarlet & Violet\", \"Obsidian Flames\", \"151\") - READ THIS CAREFULLY",\n'
    ' "set_code": "small set code near the number (e.g., S10D, SM12, XY7, base1) or null",\n'
    ' "number": "collector number EXACTLY as printed (e.g., 058/102, 1/204) - READ THIS CAREFULLY",\n'
    ' "rarity": "rarity symbol text (e.g., Rare Holo, Ultra Rare, Common) or null",\n'
    ' "hp": "HP value printed on card (e.g., 120) or null",\n'
    ' "confidence": 0.0-1.0,\n'
    ' "reasoning": "brief explanation of your certainty"}\n\n'
    "CRITICAL INSTRUCTIONS - REGION-SPECIFIC SCANNING:\n"
    "- STEP 1: Focus on the TOP LEFT CORNER to read the Pokemon name EXACTLY as printed\n"
    "- STEP 2: Focus on the BOTTOM LEFT CORNER to read the collector number (e.g., 058/102) and set code\n"
    "- STEP 3: Focus on the BOTTOM RIGHT or CENTER to read the set name/logo\n"
    "- STEP 4: Analyze the ARTWORK in the center to cross-reference with known Pokemon artwork\n"
    "- STEP 5: Combine all information to identify the EXACT card from the EXACT set\n"
    "- If you see ANYTHING that looks like a Pokemon card, set detected=true\n"
    "- Be VERY lenient - even blurry/partial cards should be detected=true\n"
    "- If you can read ANY Pokemon name from the card, set detected=true with that name\n"
    "- detected=false ONLY if there is clearly no Pokemon card at all\n"
    "- CONFIDENCE: If you successfully identify a card name, set confidence >= 0.70\n"
    "- CONFIDENCE: If you can read both name and number, set confidence >= 0.85\n"
    "- CONFIDENCE: Only set confidence < 0.50 if you're truly uncertain about the card\n"
    "- If Japanese, translate katakana/kanji to English. Common: ピカチュウ=Pikachu, リザードン=Charizard, etc.\n"
    "- Trust the printed name over artwork if they conflict\n"
    "- MISSING NUMBER/SET IS NOT ACCEPTABLE - You MUST read the collector number and set name from the card\n"
    "- The collector number is typically in the bottom corner (e.g., 058/102)\n"
    "- The set name is typically printed near the Pokemon logo or at the bottom\n"
    "- Only identify official Pokemon TCG cards\n"
    "- If you cannot clearly read the number or set, set confidence < 0.60 and explain why\n"
)


async def identify_card_with_vision(image_b64: str) -> dict:
    """Send image to OpenAI Vision model and parse JSON."""
    if not LLM_API_KEY:
        raise HTTPException(500, "LLM_API_KEY not configured")

    # Configure OpenAI
    client = AsyncOpenAI(api_key=LLM_API_KEY)
    
    # Clean base64: remove data URL prefix if present
    clean_b64 = image_b64
    if "," in image_b64:
        clean_b64 = image_b64.split(",")[1]
    
    logger.info(f"Sending vision request with image size: {len(clean_b64)} chars")
    
    try:
        response = await client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": IDENTIFY_SYSTEM + "\n\nIdentify the Pokemon card in this frame. Read the printed name at the top of the card EXACTLY. Reply with JSON only per the schema."},
                        {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{clean_b64}"}}
                    ]
                }
            ],
            max_tokens=300,
            temperature=0.1
        )
        raw = response.choices[0].message.content
        if raw:
            logger.info(f"OpenAI response received: {raw[:200]}...")
    except Exception as e:
        logger.exception("Vision call failed")
        err = str(e).lower()
        logger.error(f"Error details: {err}")
        if "quota" in err or "exceeded" in err or "insufficient_quota" in err:
            raise HTTPException(
                status_code=402,
                detail="llm_budget_exhausted: OpenAI API quota exceeded.",
            )
        if "invalid_image" in err or "unsupported_image" in err:
            return {"detected": False, "not_ready_reason": "Image format error — try again"}
        raise HTTPException(502, f"vision_error: {e}")

    text = raw if isinstance(raw, str) else str(raw)
    # Strip code fences if any
    text = text.strip()
    if text.startswith("```"):
        text = text.strip("`")
        if text.lower().startswith("json"):
            text = text[4:]
    text = text.strip()
    # Extract first {...}
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1:
        return {"detected": False}
    try:
        return json.loads(text[start : end + 1])
    except Exception:
        return {"detected": False}


# ---- JustTCG price lookup ----
JUSTTCG_BASE = "https://api.justtcg.com/v1"
POKEMONTCG_BASE = "https://api.pokemontcg.io/v2/cards"  # only used for English card image thumbnails
PRICECHARTING_BASE = "https://www.pricecharting.com/api/product"


def _num_key(n: Optional[str]) -> Optional[str]:
    if not n:
        return None
    return str(n).split("/")[0].strip().lstrip("0") or "0"


def _best_variant_price(variants: List[dict]) -> tuple[CardPrice, Optional[str]]:
    """Pick best price signal from a JustTCG card's variants list."""
    if not variants:
        return CardPrice(), None

    # A variant is "priced" if it has any usable numeric price signal.
    def _has_price(v: dict) -> bool:
        for k in ("price", "avgPrice30d", "avgPrice", "minPrice30d", "maxPrice30d"):
            if isinstance(v.get(k), (int, float)):
                return True
        return False

    # If any variant is priced, restrict scoring to those — a Near Mint
    # variant with NO price shouldn't beat a Lightly Played one that HAS one.
    priced = [v for v in variants if _has_price(v)]
    pool = priced if priced else variants

    def score(v: dict) -> int:
        cond = (v.get("condition") or "").lower()
        printing = (v.get("printing") or "").lower()
        s = 0
        if "near mint" in cond:
            s += 50
        elif "lightly played" in cond:
            s += 30
        elif cond:
            s += 10
        if "holofoil" in printing and "reverse" not in printing:
            s += 8
        elif "reverse" in printing:
            s += 6
        elif "normal" in printing:
            s += 4
        # Heavily prefer priced variants so a market price is populated when available.
        if isinstance(v.get("price"), (int, float)):
            s += 40
        return s

    sorted_v = sorted(pool, key=score, reverse=True)
    primary = sorted_v[0]

    def num(k: str) -> Optional[float]:
        val = primary.get(k)
        return float(val) if isinstance(val, (int, float)) else None

    market = num("price")
    # Prefer 30d stats of the primary variant for a coherent low/mid/high
    low = num("minPrice30d") or num("minPrice7d") or market
    mid = num("avgPrice30d") or num("avgPrice") or market
    high = num("maxPrice30d") or num("maxPrice7d") or market
    return (
        CardPrice(low=low, mid=mid, high=high, market=market),
        primary.get("printing"),
    )


async def _justtcg_query(name: str, game: str, number: Optional[str] = None, set_hint: Optional[str] = None) -> List[dict]:
    if not JUSTTCG_API_KEY:
        return []
    params = {"q": name, "game": game, "limit": 20, "currency": "GBP"}
    headers = {"x-api-key": JUSTTCG_API_KEY}
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            r = await client.get(f"{JUSTTCG_BASE}/cards", params=params, headers=headers)
            r.raise_for_status()
            data = r.json().get("data", []) or []
            logger.info(f"JustTCG returned {len(data)} results for {name} ({game})")
            if data:
                logger.info(f"First result keys: {list(data[0].keys())}")
            return data
    except Exception as e:
        logger.warning(f"justtcg query fail name={name} game={game}: {e}")
        return []


def _rank_candidate(c: dict, name: str, number: Optional[str], set_hint: Optional[str]) -> int:
    score = 0
    card_name = (c.get("name") or "").lower()
    name_lower = name.lower()
    
    # ABSOLUTE PRIORITY: Number match is non-negotiable
    cn = _num_key(c.get("number"))
    if number and cn:
        if cn == _num_key(number):
            score += 1000  # Massive priority for exact number match
        else:
            # Wrong number - heavily penalize
            return -1000  # This should never be chosen
    
    # Exact name match is critical
    if card_name == name_lower:
        score += 200
    elif name_lower in card_name:
        # Partial match only gets points if it's a substantial part of the name
        if len(name_lower) >= 4 and len(name_lower) / len(card_name) >= 0.7:
            score += 40
        else:
            score += 5
    
    # Set match is very important
    if set_hint:
        sh = set_hint.lower()
        sn = (c.get("set_name") or "").lower()
        if sh in sn or sn in sh:
            score += 300  # Increased significantly - set match is critical
        toks = [t for t in sh.replace("&", " ").split() if len(t) > 2]
        if toks and any(t in sn for t in toks):
            score += 100
        else:
            # Wrong set - penalize
            score -= 200
    
    return score


async def fetch_price_and_meta(
    name_english: str,
    language: str,
    number: Optional[str],
    set_hint: Optional[str],
) -> Optional[dict]:
    """Query JustTCG for both English and Japanese and return the best match.
    Returns a `matched` flag indicating whether the number+set match was strict
    (safe to show price) or loose (should warn user)."""
    lang = (language or "english").lower()
    game = "pokemon-japan" if lang == "japanese" else "pokemon"

    candidates = await _justtcg_query(name_english, game, number, set_hint)
    if not candidates:
        alt = "pokemon" if game == "pokemon-japan" else "pokemon-japan"
        candidates = await _justtcg_query(name_english, alt, number, set_hint)
        if candidates:
            game = alt

    if not candidates:
        return None

    ranked = sorted(
        candidates, key=lambda c: _rank_candidate(c, name_english, number, set_hint), reverse=True
    )
    best = ranked[0]

    # Determine match quality
    best_num = _num_key(best.get("number"))
    want_num = _num_key(number)
    number_match = bool(want_num and best_num and best_num == want_num)

    set_match = False
    if set_hint:
        sh = set_hint.lower()
        sn = (best.get("set_name") or "").lower()
        set_match = (sh in sn) or (sn in sh) or any(
            t in sn for t in sh.replace("&", " ").split() if len(t) > 2
        )

    # Strict match rules (protect against showing wrong printing's price):
    if want_num:
        strict = number_match
    elif set_hint:
        strict = set_match
    else:
        strict = False

    # Ambiguity: multiple candidates matched the number in DIFFERENT sets, and we
    # don't have a strict set match to disambiguate. Return the alternatives so
    # the frontend can let the user pick.
    # Also populate alternatives in the non-strict branch — this is exactly when
    # the user most needs the picker (we couldn't confirm the exact printing).
    alt_matches: List[dict] = []
    if want_num:
        same_num = [
            c for c in ranked
            if _num_key(c.get("number")) == want_num
            and (c.get("set_name") or "") != (best.get("set_name") or "")
        ]
        if same_num and not set_match:
            alt_matches = same_num[:4]

    if not alt_matches and not strict:
        # Non-strict fallback: surface top-ranked distinct-set candidates
        # so the user can manually pick the correct printing.
        seen_sets: set = set()
        alt_list: List[dict] = []
        for c in ranked[1:]:  # skip the "best" one — it's the primary card shown
            sn = (c.get("set_name") or "").strip()
            if not sn or sn in seen_sets:
                continue
            seen_sets.add(sn)
            alt_list.append(c)
            if len(alt_list) >= 4:
                break
        alt_matches = alt_list

    price, printing = _best_variant_price(best.get("variants") or [])
    return {
        "match": best,
        "price": price,
        "printing": printing,
        "game": game,
        "strict": strict,
        "number_match": number_match,
        "set_match": set_match,
        "alt_matches": alt_matches,
    }


# In-memory cache for pokemontcg.io lookups. Since the upstream is occasionally
# flaky (empty data on 200), remembering a good image URL for a (name,number)
# pair means repeat scans never depend on that upstream call.
_IMAGE_CACHE: Dict[str, str] = {}
_IMAGE_CACHE_MAX = 500


def _image_cache_key(name: str, number: Optional[str]) -> str:
    return f"{(name or '').strip().lower()}|{_num_key(number)}"


def _image_cache_get(name: str, number: Optional[str]) -> Optional[str]:
    return _IMAGE_CACHE.get(_image_cache_key(name, number))


def _image_cache_put(name: str, number: Optional[str], url: str) -> None:
    if not url:
        return
    key = _image_cache_key(name, number)
    # Simple LRU-ish trim: drop oldest ~10% when full
    if len(_IMAGE_CACHE) >= _IMAGE_CACHE_MAX:
        drop_n = max(1, _IMAGE_CACHE_MAX // 10)
        for k in list(_IMAGE_CACHE.keys())[:drop_n]:
            _IMAGE_CACHE.pop(k, None)
    _IMAGE_CACHE[key] = url


async def fetch_english_image(name: str, number: Optional[str] = None) -> Optional[str]:
    """Best-effort card image thumbnail from pokemontcg.io.
    Tries: (name+number exact) → (name+number without slash) → (name only, latest set).
    Retries once on 5xx errors AND once on empty 200 responses (upstream flake).
    Returns first working image URL. Caches successful lookups in-process."""
    # Fast path: check cache first — this fully eliminates the pokemontcg.io flake on repeat scans.
    cached = _image_cache_get(name, number)
    if cached:
        return cached

    n = _num_key(number)
    queries: List[str] = []
    if n:
        queries.append(f'name:"{name}" number:{n}')
        # Some cards use padded numbers like '058'; try padded too
        if n.isdigit() and len(n) < 3:
            queries.append(f'name:"{name}" number:{n.zfill(3)}')
    queries.append(f'name:"{name}"')

    for q in queries:
        for attempt in range(1):  # reduced retries to fail faster and trigger fallback
            try:
                async with httpx.AsyncClient(timeout=5) as client:
                    r = await client.get(
                        POKEMONTCG_BASE,
                        params={"q": q, "pageSize": 5, "orderBy": "-set.releaseDate"},
                    )
                    if r.status_code >= 500:
                        logger.warning(f"PokemonTCG.io returned {r.status_code}")
                        continue  # retry
                    r.raise_for_status()
                    data = r.json().get("data") or []
                    if not data:
                        logger.warning("PokemonTCG.io returned empty data")
                        break  # empty response, try next query
                    # Prefer a match whose number matches ours
                    picked = None
                    if n:
                        for c in data:
                            if _num_key(c.get("number")) == n:
                                picked = c
                                break
                    picked = picked or data[0]
                    imgs = picked.get("images") or {}
                    url = imgs.get("small") or imgs.get("large")
                    if url:
                        _image_cache_put(name, number, url)
                        return url
            except Exception as e:
                logger.warning(f"PokemonTCG.io request failed: {e}")
                continue
    return None


async def fetch_tcgplayer_image(tcgplayer_id: Optional[str]) -> Optional[str]:
    """Construct TCGPlayer image URL from tcgplayerId."""
    if not tcgplayer_id:
        return None
    try:
        # TCGPlayer image URL format
        image_url = f"https://product-images.tcgplayer.com/fit-in/200x200/{tcgplayer_id}.jpg"
        logger.info(f"Using TCGPlayer image from tcgplayerId: {tcgplayer_id}")
        return image_url
    except Exception as e:
        logger.warning(f"TCGPlayer image construction failed: {e}")
        return None


# ---- Routes ----
@api.get("/")
async def root():
    return {"message": "TCG Vision Price Checker", "ok": True}


@api.get("/health")
async def health():
    return {
        "ok": True,
        "llm_key": bool(LLM_API_KEY),
        "justtcg_key": bool(JUSTTCG_API_KEY),
    }


@api.post("/scan-card", response_model=CardInfo)
async def scan_card(req: ScanRequest):
    """Identify a Pokemon card from a base64 camera frame and fetch price data."""
    try:
        if not req.image_base64:
            raise HTTPException(400, "image_base64 required")

        # Strip data URL prefix if present
        b64 = req.image_base64
        if b64.startswith("data:"):
            b64 = b64.split(",", 1)[-1]

        ident = await identify_card_with_vision(b64)
        if not ident.get("detected"):
            return CardInfo(
                identified=False,
                reasoning=ident.get("not_ready_reason") or "No Pokemon card detected in frame",
            )
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("scan-card failed")
        raise HTTPException(500, f"scan_error: {e}")

    # Confidence gate lives on the CLIENT (user-configurable in Settings).
    # Backend just returns the raw confidence so the client can decide how strict to be.
    name_en = ident.get("name_english") or ident.get("name")
    name_native = ident.get("name_native")
    language = (ident.get("language") or "english").lower()
    if not name_en:
        return CardInfo(
            identified=False,
            reasoning="Card visible but Pokemon name could not be read",
        )

    result = await fetch_price_and_meta(
        name_english=name_en,
        language=language,
        number=ident.get("number"),
        set_hint=ident.get("set_hint"),
    )

    # Image thumbnail: prioritize TCGPlayer image from JustTCG match (correct set)
    # then fall back to PokemonTCG.io (may return wrong set)
    image_url = None
    if result and result.get("match"):
        tcgplayer_id = result["match"].get("tcgplayerId")
        if tcgplayer_id:
            try:
                image_url = await fetch_tcgplayer_image(tcgplayer_id)
                if image_url:
                    logger.info(f"Using TCGPlayer image from JustTCG match")
            except Exception as e:
                logger.warning(f"TCGPlayer image fetch failed: {e}")
                image_url = None
    
    # Fallback to PokemonTCG.io if TCGPlayer image unavailable
    if not image_url:
        try:
            preferred_number = None
            if result and result.get("match"):
                preferred_number = result["match"].get("number")
            image_url = await fetch_english_image(
                name_en,
                (preferred_number or ident.get("number")) if language == "english" else None,
            )
            if image_url:
                logger.info(f"Using PokemonTCG.io image (fallback)")
        except Exception as e:
            logger.warning(f"PokemonTCG.io image fetch failed: {e}")
            image_url = None

    display_name = name_en
    if language != "english" and name_native:
        display_name = f"{name_en}"  # english is more useful; keep native in reasoning

    if result:
        m = result["match"]
        matched_number = m.get("number")
        matched_set = m.get("set_name")
        # Build the candidates list from alt_matches (works for both strict and non-strict paths).
        alts = result.get("alt_matches") or []
        candidates_list: List[CardCandidate] = []
        for alt in alts:
            alt_variants = alt.get("variants") or []
            alt_price = None
            for v in alt_variants:
                p = v.get("price")
                if isinstance(p, (int, float)):
                    alt_price = float(p)
                    break
            candidates_list.append(
                CardCandidate(
                    name=alt.get("name") or name_en,
                    set_name=alt.get("set_name"),
                    number=alt.get("number"),
                    rarity=alt.get("rarity"),
                    price_market=alt_price,
                    just_id=alt.get("id"),
                )
            )

        if result.get("strict"):
            # Strict match — safe to use JustTCG's clean set/number, and show the price.
            info = CardInfo(
                identified=True,
                name=m.get("name") or display_name,
                set_name=matched_set or ident.get("set_hint"),
                number=matched_number or ident.get("number"),
                rarity=m.get("rarity") or ident.get("rarity"),
                hp=ident.get("hp"),
                language=language,
                image_url=image_url,
                price=result["price"],
                price_source=f"JustTCG · {result['game']}"
                + (f" · {result['printing']}" if result.get("printing") else ""),
                confidence=ident.get("confidence"),
                reasoning=(
                    f"Native name: {name_native}" if name_native and language != "english" else None
                ),
                ambiguous=len(candidates_list) > 0,
                candidates=candidates_list,
            )
        else:
            # NOT a strict match, but we still have JustTCG data for the read name.
            # Rather than hiding the price entirely, show it as an APPROXIMATE and
            # surface the picker so the user can lock the exact printing.
            approx_price = result["price"]
            has_price = approx_price and approx_price.market is not None
            info = CardInfo(
                identified=True,
                name=display_name,
                set_name=ident.get("set_hint") or matched_set,
                number=ident.get("number") or matched_number,
                rarity=ident.get("rarity") or m.get("rarity"),
                hp=ident.get("hp"),
                language=language,
                image_url=image_url,
                price=approx_price if has_price else CardPrice(),
                price_source=(
                    f"JustTCG · {result['game']} · closest match · approximate"
                    if has_price else None
                ),
                confidence=ident.get("confidence"),
                reasoning=(
                    "Approximate price shown — exact printing not confirmed. "
                    "Tap a set below to lock the correct printing."
                    if has_price else
                    "Collector number wasn't fully readable — showing the identified card "
                    "without price to avoid a mismatch. Hold the card steady so the number "
                    "at the bottom is in focus for the exact market price."
                ),
                ambiguous=len(candidates_list) > 0,
                candidates=candidates_list,
            )
    else:
        info = CardInfo(
            identified=True,
            name=display_name,
            set_name=ident.get("set_hint"),
            number=ident.get("number"),
            rarity=ident.get("rarity"),
            hp=ident.get("hp"),
            language=language,
            image_url=image_url,
            confidence=ident.get("confidence"),
            reasoning=(
                f"No price data on JustTCG for this "
                f"{'Japanese' if language == 'japanese' else language} card"
            ),
        )

    # Save to history (in-memory)
    async with _history_lock:
        _history_memory.insert(0, info)
        if len(_history_memory) > 100:  # Keep last 100 scans
            _history_memory.pop()
    
    return info


@api.get("/history", response_model=List[CardInfo])
async def get_history(limit: int = 50):
    async with _history_lock:
        return _history_memory[:limit]


@api.delete("/history")
async def clear_history():
    async with _history_lock:
        _history_memory.clear()
    return {"ok": True}


@api.get("/scanned-sets")
async def get_scanned_sets():
    """Return sets that have been scanned for binder creation"""
    return {"sets": [{"name": set_name, "total_in_set": total} for set_name, total in _scanned_sets.items()]}


@api.post("/voice/transcribe")
async def transcribe(file: UploadFile = File(...)):
    """Accept an audio blob (m4a/wav/mp3) and return transcript text."""
    if not LLM_API_KEY:
        raise HTTPException(500, "LLM_API_KEY not configured")
    data = await file.read()
    if not data:
        raise HTTPException(400, "empty audio")

    client = AsyncOpenAI(api_key=LLM_API_KEY)
    
    try:
        resp = await client.audio.transcriptions.create(
            model="whisper-1",
            file=data,
            response_format="text"
        )
        text = resp if isinstance(resp, str) else str(resp)
        return {"text": text or ""}
    except Exception as e:
        logger.exception("STT failed")
        raise HTTPException(502, f"stt_error: {e}")


VOICE_SYSTEM = (
    "You are a friendly, concise TCG (Pokemon Trading Card Game) expert assistant for a live camera price checker. "
    "You speak short answers (1-3 sentences) suitable for text-to-speech. "
    "You know current card names, sets, rarities, and general market pricing behavior. "
    "If the user asks about the card currently in view, use the provided CURRENT CARD JSON context; "
    "quote its name, set, rarity, and market price when relevant. "
    "If no card is in view, answer general Pokemon TCG questions helpfully."
)


@api.post("/voice/chat")
async def voice_chat(req: VoiceChatRequest):
    """Given user text + optional current card context, return AI reply text + TTS mp3 base64."""
    if not LLM_API_KEY:
        raise HTTPException(500, "LLM_API_KEY not configured")
    if not req.text.strip():
        raise HTTPException(400, "empty text")

    try:
        ctx = await get_card_context(req.card_id)
    except Exception:
        ctx = ""

    client = AsyncOpenAI(api_key=LLM_API_KEY)

    prompt = req.text if not ctx else f"{ctx}\n\nUser: {req.text}"
    try:
        response = await client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {
                    "role": "system",
                    "content": VOICE_SYSTEM
                },
                {
                    "role": "user",
                    "content": prompt
                }
            ],
            max_tokens=500
        )
        result_text = response.choices[0].message.content.strip()
    except Exception as e:
        logger.exception("chat failed")
        raise HTTPException(502, f"chat_error: {e}")

    # TTS
    try:
        response = await client.audio.speech.create(
            model="tts-1",
            voice=(req.voice or "nova"),
            input=result_text[:4000],
            response_format="mp3"
        )
        audio_b64 = base64.b64encode(response.content).decode("utf-8")
    except Exception:
        logger.exception("tts failed")
        audio_b64 = None

    return {"reply": result_text, "audio_base64": audio_b64, "mime": "audio/mpeg"}


def _parse_number_int(number: Optional[str]) -> tuple[Optional[int], Optional[int]]:
    """Return (position_int, total_in_set) from '058/102' -> (58, 102)."""
    if not number:
        return None, None
    parts = str(number).replace(" ", "").split("/")
    try:
        pos = int("".join(ch for ch in parts[0] if ch.isdigit()) or "0") or None
    except ValueError:
        pos = None
    tot = None
    if len(parts) > 1:
        try:
            tot = int("".join(ch for ch in parts[1] if ch.isdigit()) or "0") or None
        except ValueError:
            tot = None
    return pos, tot


class PickCandidateRequest(BaseModel):
    name: str
    set_name: str
    number: str
    language: Optional[str] = "english"


@api.post("/scan-card/pick", response_model=CardInfo)
async def pick_candidate(req: PickCandidateRequest):
    """Look up the JustTCG record for a specific user-picked candidate (from an ambiguous scan)."""
    lang = (req.language or "english").lower()
    game = "pokemon-japan" if lang == "japanese" else "pokemon"
    candidates = await _justtcg_query(req.name, game, req.number, req.set_name)
    if not candidates:
        raise HTTPException(404, "candidate_not_found")

    # Find exact set+number match
    want_num = _num_key(req.number)
    sh = (req.set_name or "").lower()
    match = None
    for c in candidates:
        if _num_key(c.get("number")) == want_num and (
            sh in (c.get("set_name") or "").lower()
            or (c.get("set_name") or "").lower() in sh
        ):
            match = c
            break
    match = match or candidates[0]

    price, printing = _best_variant_price(match.get("variants") or [])
    
    # Get image URL with same fallback logic as main scan endpoint
    image_url = None
    try:
        image_url = await fetch_english_image(req.name, req.number)
        if image_url:
            logger.info(f"Using PokemonTCG.io image for picked candidate")
    except Exception as e:
        logger.warning(f"PokemonTCG.io image fetch failed for picked candidate: {e}")
        image_url = None
    
    # Fallback to TCGPlayer image from tcgplayerId
    if not image_url:
        tcgplayer_id = match.get("tcgplayerId")
        if tcgplayer_id:
            image_url = await fetch_tcgplayer_image(tcgplayer_id)
    
    info = CardInfo(
        identified=True,
        name=match.get("name") or req.name,
        set_name=match.get("set_name") or req.set_name,
        number=match.get("number") or req.number,
        rarity=match.get("rarity"),
        language=lang,
        image_url=image_url,
        price=price,
        price_source=f"JustTCG · {game}" + (f" · {printing}" if printing else "") + " · picked",
        confidence=1.0,
    )
    # Save to scans history for consistency (optional)
    if mongo_available:
        try:
            doc = info.model_dump()
            doc["price"] = info.price.model_dump()
            await db.scans.insert_one({**doc, "_id": info.id})
        except Exception as e:
            logger.warning(f"Failed to save to history: {e}")
    return info


class SearchCardsRequest(BaseModel):
    query: str
    language: Optional[str] = "english"


class SearchCardsResponse(BaseModel):
    query: str
    results: List[CardCandidate]


@api.post("/scan-card/search", response_model=SearchCardsResponse)
async def search_cards(req: SearchCardsRequest):
    """Manual card search — user-typed query when the vision misidentifies the card.
    Returns distinct printings so the user can then pick one and lock it via /scan-card/pick."""
    q = (req.query or "").strip()
    if len(q) < 2:
        raise HTTPException(400, "query_too_short")
    lang = (req.language or "english").lower()
    game = "pokemon-japan" if lang == "japanese" else "pokemon"

    # 1) Try JustTCG in preferred language
    candidates = await _justtcg_query(q, game, None, None)
    # 2) Fallback to the other language if the primary returned nothing
    if not candidates:
        alt = "pokemon" if game == "pokemon-japan" else "pokemon-japan"
        candidates = await _justtcg_query(q, alt, None, None)
        if candidates:
            game = alt

    # Build a distinct-set result list ordered by ranker (with no number/set hints,
    # this puts exact-name matches first). Cap at 12 so mobile scroll stays snappy.
    ranked = sorted(
        candidates, key=lambda c: _rank_candidate(c, q, None, None), reverse=True
    )
    seen: set = set()
    out: List[CardCandidate] = []
    for c in ranked:
        key = f"{(c.get('set_name') or '').lower()}|{_num_key(c.get('number')) or ''}"
        if key in seen:
            continue
        seen.add(key)
        variants = c.get("variants") or []
        # Pick first variant that carries an actual price so the search list is useful.
        pm = None
        for v in variants:
            p = v.get("price")
            if isinstance(p, (int, float)):
                pm = float(p)
                break
        out.append(
            CardCandidate(
                name=c.get("name") or q,
                set_name=c.get("set_name"),
                number=c.get("number"),
                rarity=c.get("rarity"),
                price_market=pm,
                just_id=c.get("id"),
            )
        )
        if len(out) >= 12:
            break
    return SearchCardsResponse(query=q, results=out)


@api.post("/collection", response_model=CollectionItem)
async def add_to_collection(req: AddToCollectionRequest):
    """Add a card to the user's collection. Idempotent by (name + set_name + number)."""
    if not req.name.strip():
        raise HTTPException(400, "name required")

    pos, tot = _parse_number_int(req.number)
    key = f"{req.name}|{req.set_name or ''}|{req.number or ''}"
    
    async with _collection_lock:
        if key in _collection_memory:
            # Update existing
            existing = _collection_memory[key]
            if req.price_market is not None:
                existing.price_market = req.price_market
            if req.image_url:
                existing.image_url = req.image_url
            existing.added_at = datetime.now(timezone.utc).isoformat()
            return existing
        
        # Create new
        item = CollectionItem(
            id=str(uuid.uuid4()),
            name=req.name,
            set_name=req.set_name,
            number=req.number,
            number_int=pos,
            total_in_set=tot,
            rarity=req.rarity,
            language=req.language,
            image_url=req.image_url,
            price_market=req.price_market,
            added_at=datetime.now(timezone.utc).isoformat(),
        )
        _collection_memory[key] = item
        return item


@api.get("/collection", response_model=CollectionSummary)
async def get_collection():
    async with _collection_lock:
        items = list(_collection_memory.values())
    
    total_value = sum((i.price_market or 0.0) for i in items)

    # Sort all by price desc for the "mixed in price order" grid
    all_by_price = sorted(
        items, key=lambda i: (i.price_market or 0.0), reverse=True
    )

    # Group by set
    by_set_dict: Dict[str, List[CollectionItem]] = {}
    for item in items:
        set_name = item.set_name or "Unknown"
        if set_name not in by_set_dict:
            by_set_dict[set_name] = []
        by_set_dict[set_name].append(item)
    
    by_set = [
        {
            "set_name": set_name,
            "count": len(items),
            "total_value": sum((i.price_market or 0.0) for i in items),
            "items": sorted(items, key=lambda i: (i.number_int or 0))
        }
        for set_name, items in by_set_dict.items()
    ]
    by_set.sort(key=lambda x: x["set_name"])

    return CollectionSummary(
        total_cards=len(items),
        total_value=total_value,
        by_set=by_set,
        all_by_price=all_by_price
    )


@api.post("/collection/clear")
async def force_clear_collection():
    """Force clear collection to fix data format issues"""
    async with _collection_lock:
        _collection_memory.clear()
    return {"ok": True, "message": "Collection cleared"}


@api.delete("/collection/{item_id}")
async def remove_from_collection(item_id: str):
    async with _collection_lock:
        keys_to_delete = [key for key, item in _collection_memory.items() if item.id == item_id]
        for key in keys_to_delete:
            del _collection_memory[key]
    return {"ok": True, "deleted": len(keys_to_delete)}


@api.delete("/collection")
async def clear_collection():
    async with _collection_lock:
        _collection_memory.clear()
    return {"ok": True}


GRADED_SYSTEM = (
    "You are a professional Pokemon TCG market analyst estimating current USD market values for GRADED slabs. "
    "Given a specific card (name, set, number), estimate the market value for these grades. "
    "Base your estimate on recent (last 30–60 day) eBay sold listings knowledge and TCGPlayer market rate. "
    "Return ONLY a compact JSON object with no code fences:\n"
    '{"raw_nm": 0.0, "raw_lp": 0.0, '
    '"psa_10": 0.0, "psa_9": 0.0, "psa_8": 0.0, '
    '"bgs_10_pristine": 0.0, "bgs_10_black_label": 0.0, "bgs_95": 0.0, "bgs_9": 0.0, '
    '"cgc_10_pristine": 0.0, "cgc_10_perfect": 0.0, "cgc_95": 0.0, '
    '"reasoning": "1-2 sentence rationale (recent trends, population)"}\n'
    "All numbers in USD. Use 0.0 for grades that don't have a meaningful market for this card. "
    "BE HONEST — for cheap commons, PSA 10 may just be $10–20. For chase cards it can be thousands. "
    "For non-English (Japanese) cards, factor in the JP market premium. "
    "DO NOT invent numbers — if unsure, mark that grade as 0.0 with a note in reasoning."
)


@api.post("/card/graded-prices", response_model=GradedPricesResponse)
async def graded_prices(req: GradedPricesRequest):
    if not LLM_API_KEY:
        raise HTTPException(500, "LLM_API_KEY not configured")
    client = AsyncOpenAI(api_key=LLM_API_KEY)

    ctx = {
        "name": req.name,
        "set": req.set_name,
        "number": req.number,
        "rarity": req.rarity,
        "language": req.language,
        "raw_market_reference_usd": req.raw_market,
    }
    prompt = (
        f"Estimate graded market values for this card:\n{json.dumps(ctx, ensure_ascii=False)}\n"
        "Reply with JSON only per the schema."
    )
    try:
        response = await client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": GRADED_SYSTEM},
                {"role": "user", "content": prompt}
            ],
            max_tokens=500
        )
        raw = response.choices[0].message.content
    except Exception as e:
        logger.exception("graded chat failed")
        err = str(e).lower()
        if "budget" in err and "exceed" in err:
            raise HTTPException(
                status_code=402,
                detail="llm_budget_exceeded: Universal Key budget exhausted. Add balance in Profile → Universal Key.",
            )
        raise HTTPException(502, f"graded_error: {e}")

    text = raw if isinstance(raw, str) else str(raw)
    text = text.strip()
    if text.startswith("```"):
        text = text.strip("`")
        if text.lower().startswith("json"):
            text = text[4:]
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1:
        raise HTTPException(502, "graded_parse_error")
    try:
        parsed = json.loads(text[start : end + 1])
    except Exception:
        raise HTTPException(502, "graded_parse_error")

    def n(k: str) -> Optional[float]:
        v = parsed.get(k)
        try:
            return float(v) if v is not None else None
        except (TypeError, ValueError):
            return None

    grades = [
        GradedPrice(label="PSA 10 GEM MT", value=n("psa_10")),
        GradedPrice(label="PSA 9 MINT", value=n("psa_9")),
        GradedPrice(label="PSA 8 NM-MT", value=n("psa_8")),
        GradedPrice(label="BGS 10 PRISTINE", value=n("bgs_10_pristine")),
        GradedPrice(label="BGS 10 BLACK LABEL", value=n("bgs_10_black_label")),
        GradedPrice(label="BGS 9.5 GEM MINT", value=n("bgs_95")),
        GradedPrice(label="BGS 9 MINT", value=n("bgs_9")),
        GradedPrice(label="CGC 10 PRISTINE", value=n("cgc_10_pristine")),
        GradedPrice(label="CGC 10 PERFECT", value=n("cgc_10_perfect")),
        GradedPrice(label="CGC 9.5 MINT+", value=n("cgc_95")),
    ]
    reason = parsed.get("reasoning") or ""
    return GradedPricesResponse(
        raw_nm=n("raw_nm"),
        raw_lp=n("raw_lp"),
        grades=grades,
        disclaimer=(
            "AI-estimated from recent sales patterns. Not a live-market feed. "
            + (str(reason) if reason else "")
        ).strip(),
        source="GPT-5.2 estimate",
    )


GRADING_SYSTEM = (
    "You are a professional TCG card grader (PSA/BGS/CGC-style). Analyze the card image and estimate its physical condition. "
    "Return ONLY a compact JSON object, no code fences:\n"
    '{"centering_pct": 50-100, "centering": "e.g. 55/45", '
    '"corners_grade": 1-10, "edges_grade": 1-10, "surface_grade": 1-10, '
    '"overall_grade": 1-10, "overall_label": "e.g. Approx PSA 8 (NM-MT)", '
    '"notes": "1-2 sentences on what you can see (whitening, print lines, glare)"}\n'
    "Rules: Base grades on what is visible; if the image is blurry, glare-covered, or partial, prefer lower confidence and say so in notes. "
    "centering_pct is 100 for perfectly centered, lower means worse (75 ≈ 75/25 split). Overall grade should never exceed the lowest sub-grade. "
    "Use realistic values — most raw cards from packs are 7–9, not 10."
)


@api.post("/card/grade-estimate", response_model=GradeEstimateResponse)
async def grade_estimate(req: GradeEstimateRequest):
    if not LLM_API_KEY:
        raise HTTPException(500, "LLM_API_KEY not configured")
    b64 = req.image_base64
    if b64.startswith("data:"):
        b64 = b64.split(",", 1)[-1]

    client = AsyncOpenAI(api_key=LLM_API_KEY)
    
    # Clean base64
    clean_b64 = b64
    if "," in b64:
        clean_b64 = b64.split(",")[1]
    clean_b64 = clean_b64.strip()
    while len(clean_b64) % 4:
        clean_b64 += "="
    data_url = f"data:image/jpeg;base64,{clean_b64}"

    try:
        response = await client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": GRADING_SYSTEM},
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": "Estimate this card's condition/grade. Reply with JSON only."},
                        {"type": "image_url", "image_url": {"url": data_url}}
                    ]
                }
            ],
            max_tokens=500
        )
        raw = response.choices[0].message.content
    except Exception as e:
        logger.exception("grade est failed")
        err = str(e).lower()
        if "budget" in err and "exceed" in err:
            raise HTTPException(
                status_code=402,
                detail="llm_budget_exceeded: Universal Key budget exhausted.",
            )
        if "unable to process input image" in err or "invalid_argument" in err:
            raise HTTPException(422, "bad_image: could not process the captured frame — retry with card centered and in focus")
        raise HTTPException(502, f"grade_error: {e}")

    text = raw if isinstance(raw, str) else str(raw)
    text = text.strip()
    if text.startswith("```"):
        text = text.strip("`")
        if text.lower().startswith("json"):
            text = text[4:]
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1:
        raise HTTPException(502, "grade_parse_error")
    try:
        parsed = json.loads(text[start : end + 1])
    except Exception:
        raise HTTPException(502, "grade_parse_error")

    def nf(k):
        v = parsed.get(k)
        try:
            return float(v) if v is not None else None
        except (TypeError, ValueError):
            return None

    return GradeEstimateResponse(
        centering_pct=nf("centering_pct"),
        centering=parsed.get("centering"),
        corners_grade=nf("corners_grade"),
        edges_grade=nf("edges_grade"),
        surface_grade=nf("surface_grade"),
        overall_grade=nf("overall_grade"),
        overall_label=parsed.get("overall_label"),
        notes=parsed.get("notes"),
        disclaimer="AI-estimated from image only. Not an official grading. Real grading requires physical submission to PSA/BGS/CGC.",
    )


app.include_router(api)

# Health check endpoint for Railway
@app.get("/api/health")
async def health_check():
    return {"status": "healthy", "service": "tcg-vision-backend"}

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Add logging middleware to see all requests
@app.middleware("http")
async def log_requests(request, call_next):
    logger.info(f"Request: {request.method} {request.url}")
    response = await call_next(request)
    logger.info(f"Response: {response.status_code}")
    return response


@app.on_event("shutdown")
async def _shutdown():
    try:
        if mongo_client:
            mongo_client.close()
    except Exception:
        pass
