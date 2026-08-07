import os
import base64
import io
import wave
import struct
import time
import pytest
import requests

BASE = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://tcg-vision-ai.preview.emergentagent.com").rstrip("/")
API = f"{BASE}/api"

def test_health():
    r = requests.get(f"{API}/health", timeout=20)
    assert r.status_code == 200
    j = r.json()
    assert j.get("ok") is True and j.get("llm_key") is True

def test_root():
    r = requests.get(f"{API}/", timeout=20)
    assert r.status_code == 200 and r.json().get("ok") is True

def _b64_from_url(url):
    r = requests.get(url, timeout=30)
    r.raise_for_status()
    return base64.b64encode(r.content).decode()

@pytest.fixture(scope="module")
def pikachu_b64():
    return _b64_from_url("https://images.pokemontcg.io/base1/58_hires.png")

def test_scan_pikachu(pikachu_b64):
    r = requests.post(f"{API}/scan-card", json={"image_base64": pikachu_b64}, timeout=180)
    assert r.status_code == 200, r.text
    j = r.json()
    assert j["identified"] is True, j
    assert j.get("name") and "pikachu" in j["name"].lower()
    # language field must be populated
    assert j.get("language") == "english", f"language={j.get('language')}"
    # price_source must reference JustTCG
    assert j.get("price_source") and "JustTCG" in j["price_source"], f"price_source={j.get('price_source')}"
    # image_url must be populated (pokemontcg.io best-effort)
    assert j.get("image_url") and j["image_url"].startswith("http"), f"image_url missing: {j.get('image_url')}"
    p = j.get("price") or {}
    assert p.get("market") is not None, f"no market price: {p}"
    # coherent ordering low <= market/mid <= high
    lo, mi, hi, mk = p.get("low"), p.get("mid"), p.get("high"), p.get("market")
    if lo is not None and hi is not None:
        assert lo <= hi + 1e-6, f"low>{hi}: {p}"
    if lo is not None and mk is not None:
        assert lo <= mk + 1e-6, f"low>market: {p}"
    if hi is not None and mk is not None:
        assert mk <= hi + 1e-6, f"market>high: {p}"
    if mi is not None and lo is not None and hi is not None:
        assert lo - 1e-6 <= mi <= hi + 1e-6, f"mid outside range: {p}"

def test_scan_non_card():
    # 1x1 white PNG — vision cannot possibly read a card here
    png = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkAAIAAAoAAv/lxKUAAAAASUVORK5CYII=")
    b64 = base64.b64encode(png).decode()
    r = requests.post(f"{API}/scan-card", json={"image_base64": b64}, timeout=90)
    assert r.status_code == 200
    j = r.json()
    assert j.get("identified") is False
    # New prompt: must be one of these two reasoning strings
    reasoning = (j.get("reasoning") or "").strip()
    allowed = {
        "Scanning... please steady the camera",
        "No Pokemon card detected in frame",
    }
    assert reasoning in allowed, f"unexpected reasoning: {reasoning!r}"

def test_scan_blurry_low_quality(pikachu_b64):
    """Iter 11.1: server-side 0.55 gate is REMOVED. Backend should pass through whatever
    the vision model returns — identified=true with raw confidence, OR identified=false
    only when the model itself couldn't detect a card / read a name. The client threshold
    is authoritative."""
    from PIL import Image, ImageFilter
    raw = base64.b64decode(pikachu_b64)
    img = Image.open(io.BytesIO(raw)).convert("RGB")
    tiny = img.resize((24, 34), Image.BILINEAR)
    up = tiny.resize(img.size, Image.BILINEAR).filter(ImageFilter.GaussianBlur(radius=8))
    buf = io.BytesIO()
    up.save(buf, format="PNG")
    b64 = base64.b64encode(buf.getvalue()).decode()
    r = requests.post(f"{API}/scan-card", json={"image_base64": b64}, timeout=180)
    assert r.status_code == 200, r.text
    j = r.json()
    if j.get("identified") is True:
        # Passthrough: confidence must be present (can be anything, incl. <0.55)
        assert "confidence" in j, f"expected confidence field: {j}"
        print(f"Blurry image passthrough: name={j.get('name')} conf={j.get('confidence')}")
    else:
        assert j.get("reasoning"), "expected reasoning for identified=false"

def test_history_and_clear(pikachu_b64):
    r = requests.get(f"{API}/history", timeout=20)
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)
    for it in data:
        assert "_id" not in it and "id" in it
    # clear
    d = requests.delete(f"{API}/history", timeout=20)
    assert d.status_code == 200
    r2 = requests.get(f"{API}/history", timeout=20)
    assert r2.status_code == 200 and r2.json() == []

def _silent_wav():
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(16000)
        # 1s silence
        w.writeframes(b"\x00\x00" * 16000)
    return buf.getvalue()

def test_transcribe():
    wav = _silent_wav()
    files = {"file": ("audio.wav", wav, "audio/wav")}
    r = requests.post(f"{API}/voice/transcribe", files=files, timeout=90)
    assert r.status_code == 200, r.text
    assert "text" in r.json()

def test_voice_chat_with_context():
    ctx = {"name":"Pikachu","set_name":"Base Set","number":"58/102","price":{"market":12.34}}
    r = requests.post(f"{API}/voice/chat", json={"text":"How much is this card worth?","card_context":ctx}, timeout=120)
    assert r.status_code == 200, r.text
    j = r.json()
    assert j.get("reply")
    assert j.get("mime") == "audio/mpeg"
    assert j.get("audio_base64") and len(j["audio_base64"]) > 500

def test_voice_chat_empty_context():
    r = requests.post(f"{API}/voice/chat", json={"text":"What is a booster pack?"}, timeout=120)
    assert r.status_code == 200
    assert r.json().get("reply")
