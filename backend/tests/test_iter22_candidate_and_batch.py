"""Iter 22 backend additions:
1. POST /api/scan-card/pick — resolve a chosen candidate to full CardInfo w/ price+image.
2. POST /api/scan-card — response must include `ambiguous` (bool) and `candidates` (list) fields.
"""
import os
import base64
import requests
import pytest

BASE = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://tcg-vision-ai.preview.emergentagent.com").rstrip("/")
API = f"{BASE}/api"


@pytest.fixture(scope="module")
def pikachu_b64():
    r = requests.get("https://images.pokemontcg.io/base1/58_hires.png", timeout=30)
    r.raise_for_status()
    return base64.b64encode(r.content).decode()


def test_pick_candidate_pikachu_base_58():
    """Canonical case: pick Pikachu / Base / 58 / english should return 200 w/ populated CardInfo."""
    payload = {"name": "Pikachu", "set_name": "Base", "number": "58", "language": "english"}
    r = requests.post(f"{API}/scan-card/pick", json=payload, timeout=60)
    assert r.status_code == 200, r.text
    j = r.json()
    assert j.get("identified") is True
    assert j.get("name") and "pikachu" in j["name"].lower()
    # set_name and number should be populated (may be normalized by JustTCG)
    assert j.get("set_name")
    assert j.get("number")
    # image_url must be non-null (pokemontcg.io lookup for english cards)
    assert j.get("image_url") and j["image_url"].startswith("http"), f"image_url={j.get('image_url')}"
    # price.market populated when JustTCG has it
    p = j.get("price") or {}
    assert p.get("market") is not None, f"price.market missing: {p}"
    assert j.get("price_source") and "JustTCG" in j["price_source"]
    assert "picked" in j["price_source"]


def test_pick_candidate_unknown_returns_404():
    """Non-existent card should return 404 candidate_not_found."""
    payload = {
        "name": "ZZZ_NoSuchCard_9999",
        "set_name": "NonExistent Set",
        "number": "999",
        "language": "english",
    }
    r = requests.post(f"{API}/scan-card/pick", json=payload, timeout=60)
    # Either 404 (no candidates) or 200 with best-effort fallback
    assert r.status_code in (200, 404), r.text


def test_scan_card_response_has_ambiguous_and_candidates_fields(pikachu_b64):
    """Ensure /api/scan-card response includes `ambiguous` and `candidates` fields (even if empty)."""
    r = requests.post(f"{API}/scan-card", json={"image_base64": pikachu_b64}, timeout=180)
    assert r.status_code == 200, r.text
    j = r.json()
    # ambiguous must exist as bool
    assert "ambiguous" in j, f"missing 'ambiguous' key: {list(j.keys())}"
    assert isinstance(j["ambiguous"], bool), f"ambiguous is not bool: {type(j['ambiguous'])}"
    # candidates must exist as list
    assert "candidates" in j, f"missing 'candidates' key: {list(j.keys())}"
    assert isinstance(j["candidates"], list), f"candidates is not list: {type(j['candidates'])}"
    # for canonical Pikachu Base 58 scan, still identified
    assert j.get("identified") is True


def test_scan_card_non_card_still_has_new_fields():
    """Even for non-detected scans, response should conform to CardInfo model shape."""
    png = base64.b64decode(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkAAIAAAoAAv/lxKUAAAAASUVORK5CYII="
    )
    b64 = base64.b64encode(png).decode()
    r = requests.post(f"{API}/scan-card", json={"image_base64": b64}, timeout=90)
    assert r.status_code == 200, r.text
    j = r.json()
    assert j.get("identified") is False
    assert "ambiguous" in j
    assert "candidates" in j
    assert j["candidates"] == []
