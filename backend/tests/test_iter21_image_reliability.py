"""Iter 21: fetch_english_image robustness.
Verify Pikachu Base 58 scan reliably returns non-null image_url across 5 sequential calls."""
import os
import base64
import time
import requests
import pytest

BASE = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://tcg-vision-ai.preview.emergentagent.com").rstrip("/")
API = f"{BASE}/api"


def _b64_from_url(url):
    r = requests.get(url, timeout=30)
    r.raise_for_status()
    return base64.b64encode(r.content).decode()


@pytest.fixture(scope="module")
def pikachu_b64():
    return _b64_from_url("https://images.pokemontcg.io/base1/58_hires.png")


def _scan(b64):
    t0 = time.time()
    r = requests.post(f"{API}/scan-card", json={"image_base64": b64}, timeout=90)
    dt = time.time() - t0
    assert r.status_code == 200, r.text
    return r.json(), dt


# --- REPEATABILITY: 5x sequential scans should all return non-null image_url ---
def test_pikachu_image_reliability_5x(pikachu_b64):
    """Fires 5 sequential scan-card requests with Pikachu Base 58 image.
    Every response must have image_url != null, name=Pikachu, number containing 58, and price populated."""
    failures = []
    successes = []
    for i in range(5):
        j, dt = _scan(pikachu_b64)
        entry = {
            "call": i + 1,
            "identified": j.get("identified"),
            "name": j.get("name"),
            "number": j.get("number"),
            "image_url": j.get("image_url"),
            "price_market": (j.get("price") or {}).get("market"),
            "elapsed_s": round(dt, 1),
        }
        ok = True
        if not j.get("identified"):
            ok = False
        if "pikachu" not in (j.get("name") or "").lower():
            ok = False
        num = (j.get("number") or "").replace(" ", "")
        if "58" not in num:
            ok = False
        if not j.get("image_url"):
            ok = False
        price = (j.get("price") or {}).get("market")
        if price is None or price <= 0:
            ok = False
        (successes if ok else failures).append(entry)
    print(f"\n[iter21] 5x pikachu scan summary — success={len(successes)}/5 fail={len(failures)}/5")
    for e in successes + failures:
        print(f"   call={e['call']} name={e['name']} num={e['number']} image={'YES' if e['image_url'] else 'NULL'} price={e['price_market']} t={e['elapsed_s']}s")
    assert not failures, f"{len(failures)}/5 calls failed image/price contract: {failures}"


# --- Non-card image still returns identified=false gracefully (regression) ---
def test_non_card_graceful_iter21():
    tiny_png = base64.b64decode(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
    )
    b64 = base64.b64encode(tiny_png).decode()
    r = requests.post(f"{API}/scan-card", json={"image_base64": b64}, timeout=60)
    assert r.status_code == 200, r.text
    j = r.json()
    assert j["identified"] is False, f"1x1 should not identify: {j}"
