"""Backend tests for /api/card/graded-prices and /api/card/grade-estimate (Iter 9)."""
import os
import base64
import requests

BASE = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://tcg-vision-ai.preview.emergentagent.com").rstrip("/")
API = f"{BASE}/api"


EXPECTED_GRADE_LABELS = [
    "PSA 10 GEM MT",
    "PSA 9 MINT",
    "PSA 8 NM-MT",
    "BGS 10 PRISTINE",
    "BGS 10 BLACK LABEL",
    "BGS 9.5 GEM MINT",
    "BGS 9 MINT",
    "CGC 10 PRISTINE",
    "CGC 10 PERFECT",
    "CGC 9.5 MINT+",
]


# --- /api/card/graded-prices ---
def test_graded_prices_charizard_base_shape_and_chase_price():
    payload = {
        "name": "Charizard",
        "set_name": "Base Set",
        "number": "4/102",
        "rarity": "Holo Rare",
        "language": "english",
        "raw_market": 350.0,
    }
    r = requests.post(f"{API}/card/graded-prices", json=payload, timeout=90)
    assert r.status_code == 200, r.text
    j = r.json()

    # Source and disclaimer
    assert j.get("source") == "GPT-5.2 estimate", j.get("source")
    assert isinstance(j.get("disclaimer"), str) and j["disclaimer"], j.get("disclaimer")

    # Raw NM/LP keys present (nullable)
    assert "raw_nm" in j and "raw_lp" in j

    # Grades list exact labels & order
    grades = j.get("grades")
    assert isinstance(grades, list) and len(grades) == 10, grades
    labels = [g["label"] for g in grades]
    assert labels == EXPECTED_GRADE_LABELS, labels

    # PSA 10 must be > 100 for a chase card at raw_market=350
    psa10 = next(g for g in grades if g["label"] == "PSA 10 GEM MT")
    assert psa10.get("value") is not None and psa10["value"] > 100, psa10


def test_graded_prices_minimal_payload_still_ok():
    # Even with no raw_market, endpoint must return the 10-grade structure
    r = requests.post(f"{API}/card/graded-prices", json={"name": "Pikachu", "set_name": "Base Set", "number": "58/102"}, timeout=90)
    assert r.status_code == 200, r.text
    j = r.json()
    assert len(j.get("grades", [])) == 10
    assert j["source"] == "GPT-5.2 estimate"


# --- /api/card/grade-estimate ---
def test_grade_estimate_pikachu_image():
    img = requests.get("https://images.pokemontcg.io/base1/58_hires.png", timeout=30)
    img.raise_for_status()
    b64 = base64.b64encode(img.content).decode()

    r = requests.post(f"{API}/card/grade-estimate", json={"image_base64": b64}, timeout=120)
    assert r.status_code == 200, r.text
    j = r.json()
    # Must contain disclaimer
    assert isinstance(j.get("disclaimer"), str) and j["disclaimer"]
    # overall_grade should be a float 1-10
    og = j.get("overall_grade")
    assert og is not None, j
    assert 1.0 <= float(og) <= 10.0, og


def test_grade_estimate_bad_payload():
    # Empty base64 → backend should still respond (502 or graceful) — not 500 crash
    r = requests.post(f"{API}/card/grade-estimate", json={"image_base64": ""}, timeout=60)
    assert r.status_code in (200, 400, 422, 502), r.status_code
