"""Backend tests for /api/collection endpoints (Iter 8)."""
import os
import requests

BASE = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://tcg-vision-ai.preview.emergentagent.com").rstrip("/")
API = f"{BASE}/api"


def _reset():
    requests.delete(f"{API}/collection", timeout=15)


def _payload(name="TEST_Pikachu", set_name="Base Set", number="058/102", price=12.5):
    return {
        "name": name,
        "set_name": set_name,
        "number": number,
        "rarity": "Common",
        "language": "english",
        "image_url": "https://images.pokemontcg.io/base1/58_hires.png",
        "price_market": price,
    }


# --- POST /api/collection ---
def test_add_returns_parsed_number_int_and_total():
    _reset()
    r = requests.post(f"{API}/collection", json=_payload(), timeout=15)
    assert r.status_code in (200, 201), r.text
    j = r.json()
    assert j["number_int"] == 58, j
    assert j["total_in_set"] == 102, j
    assert j.get("id") and j.get("added_at")
    assert "_id" not in j
    _reset()


def test_add_is_idempotent_and_updates_price():
    _reset()
    p1 = _payload(price=10.0)
    r1 = requests.post(f"{API}/collection", json=p1, timeout=15)
    assert r1.status_code in (200, 201)
    first_added = r1.json()["added_at"]

    p2 = _payload(price=20.0)
    r2 = requests.post(f"{API}/collection", json=p2, timeout=15)
    assert r2.status_code in (200, 201)

    # Only one card in the collection
    s = requests.get(f"{API}/collection", timeout=15).json()
    assert s["total_cards"] == 1, s
    assert s["total_value"] == 20.0, s

    # added_at should be refreshed (>= first)
    updated = r2.json()["added_at"]
    assert updated >= first_added
    _reset()


# --- GET /api/collection ---
def test_get_summary_structure_and_sorting():
    _reset()
    # Add 3 cards from 2 sets with varied prices/numbers
    requests.post(f"{API}/collection", json=_payload("TEST_A", "Base Set", "010/102", 5.0), timeout=15)
    requests.post(f"{API}/collection", json=_payload("TEST_B", "Base Set", "058/102", 20.0), timeout=15)
    requests.post(f"{API}/collection", json=_payload("TEST_C", "Jungle", "001/064", 15.0), timeout=15)

    r = requests.get(f"{API}/collection", timeout=15)
    assert r.status_code == 200
    s = r.json()
    assert s["total_cards"] == 3
    assert abs(s["total_value"] - 40.0) < 1e-6

    # all_by_price DESC
    prices = [i["price_market"] for i in s["all_by_price"]]
    assert prices == sorted(prices, reverse=True), prices

    # by_set sorted by count desc
    counts = [g["count"] for g in s["by_set"]]
    assert counts == sorted(counts, reverse=True), counts
    base_set = next(g for g in s["by_set"] if g["set_name"] == "Base Set")
    # items within a set sorted by number_int ASC
    nums = [it["number_int"] for it in base_set["items"]]
    assert nums == [10, 58], nums

    # No _id leaked
    for it in s["all_by_price"]:
        assert "_id" not in it
    _reset()


def test_empty_collection_returns_zero_summary():
    _reset()
    r = requests.get(f"{API}/collection", timeout=15)
    assert r.status_code == 200
    s = r.json()
    assert s["total_cards"] == 0
    assert s["total_value"] == 0
    assert s["by_set"] == [] and s["all_by_price"] == []


# --- DELETE ---
def test_delete_single_item_and_delete_all():
    _reset()
    r1 = requests.post(f"{API}/collection", json=_payload("TEST_X", "Base Set", "010/102", 5.0), timeout=15).json()
    r2 = requests.post(f"{API}/collection", json=_payload("TEST_Y", "Base Set", "058/102", 20.0), timeout=15).json()

    d = requests.delete(f"{API}/collection/{r1['id']}", timeout=15)
    assert d.status_code == 200
    assert d.json().get("deleted") == 1
    s = requests.get(f"{API}/collection", timeout=15).json()
    assert s["total_cards"] == 1 and s["all_by_price"][0]["id"] == r2["id"]

    # Clear all
    d2 = requests.delete(f"{API}/collection", timeout=15)
    assert d2.status_code == 200
    s2 = requests.get(f"{API}/collection", timeout=15).json()
    assert s2["total_cards"] == 0
