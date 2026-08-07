"""Perf sanity check: /api/scan-card with gemini-3-flash-preview should be <10s typical."""
import base64
import os
import time
import requests

BASE = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://tcg-vision-ai.preview.emergentagent.com").rstrip("/")

def test_scan_latency():
    b64 = base64.b64encode(requests.get("https://images.pokemontcg.io/base1/58_hires.png", timeout=30).content).decode()
    times = []
    for i in range(3):
        t0 = time.time()
        r = requests.post(f"{BASE}/api/scan-card", json={"image_base64": b64}, timeout=60)
        dt = time.time() - t0
        assert r.status_code == 200, r.text
        j = r.json()
        assert j.get("identified") is True
        assert "pikachu" in (j.get("name") or "").lower()
        times.append(dt)
        print(f"run {i+1}: {dt:.2f}s identified={j.get('identified')} name={j.get('name')} market={j.get('price', {}).get('market')}")
    avg = sum(times)/len(times)
    print(f"avg latency: {avg:.2f}s over {len(times)} runs; times={times}")
    # Not a hard fail — just visibility; but 20s ceiling
    assert avg < 20, f"avg latency too high: {avg:.2f}s"
