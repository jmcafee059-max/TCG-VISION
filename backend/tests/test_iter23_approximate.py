"""Iter 23 tests:
- BUG FIX: /api/scan-card non-strict branch now returns price + candidates + 'approximate' source.
- REGRESSION: strict path (Pikachu Base 58) still works.
- REGRESSION: /api/scan-card/pick still works.
- INTERNAL: _best_variant_price now prefers priced variants (Charizard Base Set → market > 0).
"""
import os
import sys
import base64
import asyncio
import pytest
import requests

# Make backend server importable for direct function tests
sys.path.insert(0, "/app/backend")

BASE = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://tcg-vision-ai.preview.emergentagent.com").rstrip("/")
API = f"{BASE}/api"


# ---------- INTERNAL FUNCTION TESTS (direct import) ----------

def test_fetch_price_and_meta_charizard_no_number_non_strict():
    """Bug fix core: call internal fetch_price_and_meta with name only (no number/set).
    Must return strict=False, price.market != None, alt_matches populated."""
    from server import fetch_price_and_meta

    result = asyncio.get_event_loop().run_until_complete(
        fetch_price_and_meta(
            name_english="Charizard", language="english", number=None, set_hint=None
        )
    )
    assert result is not None, "no result at all"
    assert result.get("strict") is False, f"expected non-strict, got {result.get('strict')}"
    price = result.get("price")
    assert price is not None, "price object missing"
    assert price.market is not None, f"price.market is None (regression) — {price}"
    assert price.market > 0, f"price.market should be > 0, got {price.market}"
    alts = result.get("alt_matches") or []
    assert len(alts) > 0, f"expected at least one alt_match candidate, got {len(alts)}"


def test_best_variant_price_prefers_priced_variants_charizard():
    """Verify _best_variant_price picks a priced variant even if a Near-Mint variant has no price."""
    from server import _best_variant_price

    # Simulated Charizard variants: NM has no price, LP has a price.
    # Bug: old scoring picked NM (higher condition score) -> market=None.
    # Fix: any priced variant wins because 'priced' pool is scored first.
    variants = [
        {"condition": "Near Mint", "printing": "Holofoil"},  # no price
        {"condition": "Lightly Played", "printing": "Holofoil", "price": 350.0,
         "avgPrice30d": 340.0, "minPrice30d": 320.0, "maxPrice30d": 380.0},
    ]
    price, printing = _best_variant_price(variants)
    assert price.market is not None, "market should be populated from priced variant"
    assert price.market == 350.0, f"expected 350.0 got {price.market}"


def test_best_variant_price_all_no_price_returns_none():
    """Edge: if NO variant has a price at all, we should degrade gracefully."""
    from server import _best_variant_price

    variants = [
        {"condition": "Near Mint", "printing": "Holofoil"},
        {"condition": "Lightly Played", "printing": "Normal"},
    ]
    price, _ = _best_variant_price(variants)
    assert price.market is None


# ---------- API-LEVEL TESTS (via HTTP) ----------

def _b64_from_url(url):
    r = requests.get(url, timeout=30)
    r.raise_for_status()
    return base64.b64encode(r.content).decode()


@pytest.fixture(scope="module")
def pikachu_b64():
    return _b64_from_url("https://images.pokemontcg.io/base1/58_hires.png")


def test_regression_scan_pikachu_strict(pikachu_b64):
    """Strict path must still work: Pikachu Base 58 → identified, name Pikachu,
    number contains 58, market>0, price_source NOT 'approximate', ambiguous=False."""
    r = requests.post(f"{API}/scan-card", json={"image_base64": pikachu_b64}, timeout=180)
    assert r.status_code == 200, r.text
    j = r.json()
    assert j.get("identified") is True, j
    assert "pikachu" in (j.get("name") or "").lower(), f"name: {j.get('name')}"
    assert "58" in (j.get("number") or ""), f"number: {j.get('number')}"
    price = j.get("price") or {}
    assert price.get("market") is not None and price["market"] > 0, f"price: {price}"
    ps = j.get("price_source") or ""
    assert "approximate" not in ps.lower(), f"strict path leaked 'approximate': {ps}"
    assert j.get("ambiguous") is False, f"ambiguous should be False on strict Pikachu: {j.get('ambiguous')}"


def test_regression_pick_endpoint():
    """/api/scan-card/pick still works for {Pikachu, Base, 58}."""
    r = requests.post(
        f"{API}/scan-card/pick",
        json={"name": "Pikachu", "set_name": "Base", "number": "58", "language": "english"},
        timeout=60,
    )
    assert r.status_code == 200, r.text
    j = r.json()
    assert j.get("identified") is True
    price = j.get("price") or {}
    assert price.get("market") is not None and price["market"] > 0
    ps = j.get("price_source") or ""
    assert ps.endswith(" · picked"), f"expected suffix ' · picked', got: {ps}"


# ---------- API-LEVEL NON-STRICT BRANCH (integration) ----------

def test_api_non_strict_via_low_res_image(pikachu_b64):
    """Try to trigger the non-strict branch by feeding a heavily downscaled image where
    the vision model may still read the name but not the collector number.
    If the image still triggers a strict match (upstream reads the number cleanly),
    this test is skipped — it exercises real vision behavior, not deterministic.
    The internal function test above deterministically covers the non-strict logic."""
    from PIL import Image
    import io as _io

    raw = base64.b64decode(pikachu_b64)
    img = Image.open(_io.BytesIO(raw)).convert("RGB")
    # Downscale severely so collector number becomes unreadable but name still legible
    w, h = img.size
    tiny = img.resize((max(200, w // 6), max(280, h // 6)), Image.BILINEAR)
    buf = _io.BytesIO()
    tiny.save(buf, format="JPEG", quality=45)
    b64 = base64.b64encode(buf.getvalue()).decode()

    r = requests.post(f"{API}/scan-card", json={"image_base64": b64}, timeout=180)
    assert r.status_code == 200, r.text
    j = r.json()

    if not j.get("identified"):
        pytest.skip(f"Vision could not identify low-res image: {j.get('reasoning')}")

    ps = (j.get("price_source") or "").lower()
    if "approximate" not in ps:
        # Strict match came back — that's fine, not a regression. Deterministic path
        # is covered by test_fetch_price_and_meta_charizard_no_number_non_strict.
        pytest.skip(f"Vision read number cleanly → strict path taken. price_source={j.get('price_source')}")

    # We hit the non-strict branch — verify the contract.
    price = j.get("price") or {}
    assert price.get("market") is not None, f"non-strict must still return market price: {price}"
    assert price["market"] > 0
    assert j.get("price_source", "").endswith(" · approximate") or \
           " · closest match · approximate" in j.get("price_source", ""), \
        f"unexpected price_source suffix: {j.get('price_source')}"
    candidates = j.get("candidates") or []
    assert len(candidates) >= 1, f"expected candidates in non-strict, got {len(candidates)}"
    reasoning = (j.get("reasoning") or "").lower()
    assert "approximate price" in reasoning, f"reasoning missing 'Approximate price': {j.get('reasoning')}"
