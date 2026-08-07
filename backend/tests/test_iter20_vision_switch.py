"""Iter 20: Vision model switched to Claude Sonnet 4.5.
Verify accuracy + confidence + repeatability on Pikachu Base 58."""
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


# --- Accuracy: identifies Pikachu with confidence >= 0.85, price populated ---
def test_pikachu_accuracy_claude(pikachu_b64):
    j, dt = _scan(pikachu_b64)
    assert j["identified"] is True, j
    assert "pikachu" in (j.get("name") or "").lower(), j
    # collector number - Base 58/102
    num = (j.get("number") or "").replace(" ", "")
    assert "58" in num, f"number mismatch: {num}"
    conf = j.get("confidence") or 0
    assert conf >= 0.85, f"confidence too low: {conf}"
    price = (j.get("price") or {}).get("market")
    assert price is not None and price > 0, f"no market price: {j.get('price')}"
    assert dt < 20, f"scan took {dt:.1f}s (>20s)"


# --- Repeatability: 3 calls with same image yield same name/set/number ---
def test_pikachu_repeatability_3x(pikachu_b64):
    results = []
    for i in range(3):
        j, _ = _scan(pikachu_b64)
        assert j["identified"] is True, f"call {i}: {j}"
        results.append(
            (
                (j.get("name") or "").lower(),
                (j.get("set_name") or "").lower(),
                (j.get("number") or "").replace(" ", ""),
            )
        )
    # All three should match exactly
    assert results[0] == results[1] == results[2], f"non-repeatable: {results}"


# --- Non-card image: 1x1 png returns identified=false gracefully ---
def test_non_card_graceful():
    # 1x1 transparent PNG
    tiny_png = base64.b64decode(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
    )
    b64 = base64.b64encode(tiny_png).decode()
    r = requests.post(f"{API}/scan-card", json={"image_base64": b64}, timeout=60)
    assert r.status_code == 200, r.text
    j = r.json()
    assert j["identified"] is False, f"1x1 should not identify: {j}"
