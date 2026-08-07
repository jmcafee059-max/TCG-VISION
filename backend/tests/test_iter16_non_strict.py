"""Iter 16 (UPDATED for new correct contract): verify /api/scan-card non-strict branch
trusts the VISION READ and does NOT override with JustTCG match data.

Contract on non-strict branch:
  - identified=true
  - name/set_name/number/rarity/hp come from vision `ident` (NOT from JustTCG match)
  - price is empty (all None)
  - price_source is None
  - reasoning contains "Collector number wasn't fully readable"
"""

import os
import io
import base64
import requests
import pytest
from PIL import Image, ImageDraw

BASE = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://tcg-vision-ai.preview.emergentagent.com").rstrip("/")
API = f"{BASE}/api"


@pytest.fixture(scope="module")
def pikachu_no_number_b64():
    """Pikachu base-set image with the bottom collector-number strip blacked out
    so vision reads the name but likely returns number=null → non-strict path."""
    r = requests.get("https://images.pokemontcg.io/base1/58_hires.png", timeout=30)
    r.raise_for_status()
    img = Image.open(io.BytesIO(r.content)).convert("RGB")
    w, h = img.size
    draw = ImageDraw.Draw(img)
    draw.rectangle([0, int(h * 0.86), w, h], fill=(0, 0, 0))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode()


def test_non_strict_trusts_vision_no_price(pikachu_no_number_b64):
    r = requests.post(f"{API}/scan-card", json={"image_base64": pikachu_no_number_b64}, timeout=180)
    assert r.status_code == 200, r.text
    j = r.json()
    if j.get("identified") is not True:
        pytest.skip(f"vision could not identify (test setup issue): {j}")

    reasoning = (j.get("reasoning") or "")
    price_source = j.get("price_source")

    # If vision still read the number confidently, we hit strict branch. Skip.
    if "Collector number wasn't fully readable" not in reasoning:
        pytest.skip(
            f"Vision succeeded at reading number → strict branch. "
            f"reasoning={reasoning!r} price_source={price_source!r}"
        )

    # === Non-strict branch assertions ===
    # No price, no price_source (avoid mismatch)
    assert price_source is None, f"price_source must be None on non-strict, got: {price_source!r}"
    p = j.get("price") or {}
    assert p.get("market") is None, f"price.market must be None on non-strict: {p}"
    assert p.get("low") is None and p.get("mid") is None and p.get("high") is None, f"price fields must all be None: {p}"

    # Vision-authoritative name (Pikachu — the actual card scanned)
    assert j.get("name"), f"name missing: {j}"
    assert "pikachu" in j["name"].lower(), f"vision-name should be Pikachu: {j.get('name')}"

    # Reasoning must contain the exact user-facing message
    assert "Collector number wasn't fully readable" in reasoning, f"reasoning: {reasoning!r}"
    assert "Hold the card steady" in reasoning, f"reasoning: {reasoning!r}"


def test_non_strict_never_returns_empty_cardinfo():
    """If vision fails, identified=false — never a mostly-empty CardInfo with identified=true."""
    img = Image.new("RGB", (300, 420), (128, 128, 128))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    b64 = base64.b64encode(buf.getvalue()).decode()
    r = requests.post(f"{API}/scan-card", json={"image_base64": b64}, timeout=120)
    assert r.status_code == 200, r.text
    j = r.json()
    if j.get("identified"):
        assert j.get("name"), f"identified=true but empty name: {j}"
