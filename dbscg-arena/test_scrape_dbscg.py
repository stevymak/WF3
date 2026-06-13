#!/usr/bin/env python3
"""
Tests HORS-LIGNE pour scrape_dbscg.py (volet C de la mission).
Aucun accès réseau : on teste le parsing, le regex, les spritesheets et le cache
en simulant les réponses HTTP. Lancer :  python -m pytest -q   (ou)  python test_scrape_dbscg.py
"""
import sys
from pathlib import Path

from PIL import Image

import scrape_dbscg as S


# ───────────────────────── 1. CARD_CODE_RE ─────────────────────────
def test_card_code_re_captures_valid_codes():
    cases = {
        "UB03-001.webp": "UB03-001",
        "BT27-001.png": "BT27-001",
        "P-456.webp": "P-456",
        "SD22-01.jpg": "SD22-01",
        "FB01-001_p1.webp": "FB01-001_P1",   # .upper() appliqué en aval
        "UB03-123.webp": "UB03-123",
    }
    for filename, expected in cases.items():
        m = S.CARD_CODE_RE.search(filename)
        assert m, f"devrait matcher {filename}"
        assert m.group(1).upper() == expected, f"{filename} -> {m.group(1)}"


def test_card_code_re_alt_suffix():
    m = S.CARD_CODE_RE.search("FB01-001_p1.webp")
    assert m and m.group(1).upper() == "FB01-001_P1"


# ─────────────────── 2. extract_card_images / logos ────────────────
def test_extract_ignores_nav_logos():
    """Les logos de navigation (hors chemin 'card') doivent être ignorés,
    même si leur nom ressemble à un code (ex: logo-01.png)."""
    html = """
    <html><body>
      <header>
        <img src="/assets/img/logo-01.png" alt="logo">
        <img src="/assets/nav/banner-12.png" alt="banner">
      </header>
      <ul class="cardlist">
        <li><img data-src="/images/cardlist/UB03/UB03-001.webp"></li>
        <li><img data-src="/images/cardlist/UB03/UB03-012.webp"></li>
        <li><img src="/images/card/P-456.png"></li>
      </ul>
    </body></html>
    """
    found = S.extract_card_images(html, "https://www.dbs-cardgame.com/us-en/cardlist/")
    assert set(found) == {"UB03-001", "UB03-012", "P-456"}, found
    # Aucun logo capturé
    assert all("logo" not in u and "banner" not in u for u in found.values())
    # URL absolue reconstruite
    assert found["UB03-001"].startswith("https://www.dbs-cardgame.com/")


def test_extract_prefers_data_src_over_src():
    html = '<img data-src="/cardlist/UB03-005.webp" src="/cardlist/placeholder.gif">'
    found = S.extract_card_images(html, "https://x/")
    assert "UB03-005" in found
    assert found["UB03-005"].endswith("UB03-005.webp")


def test_extract_zero_cards_does_not_crash():
    """Un set qui ne remonte aucune carte ne doit pas planter, juste renvoyer {}."""
    html = "<html><body><p>Page vide, maintenance.</p></body></html>"
    assert S.extract_card_images(html, "https://x/") == {}


# ─────────────────── 3. build_spritesheets : positions ─────────────
def _make_dummy_cards(tmp: Path, n: int) -> dict:
    paths = {}
    for i in range(n):
        code = f"UB03-{i:03d}"
        p = tmp / f"{code}.png"
        Image.new("RGB", (50, 70), (i % 255, 0, 0)).save(p)
        paths[code] = p
    return paths


def test_spritesheet_grid_positions(tmp_path):
    cols, rows, w, h = 10, 7, 40, 56
    paths = _make_dummy_cards(tmp_path, 75)  # 75 -> 2 planches (70 + 5)
    info = S.build_spritesheets(paths, tmp_path / "sheets", cols, rows, w, h)
    mapping = info["mapping"]

    assert len(info["sheets"]) == 2, "75 cartes / 70 = 2 planches"
    # Carte 0 -> coin haut-gauche, planche 0
    assert mapping["UB03-000"] == {
        "sheet": "sheets/sheet_000.jpg", "index": 0, "col": 0, "row": 0,
        "x": 0, "y": 0, "w": w, "h": h,
    }
    # Carte index 11 (12e) -> col 1, row 1 sur grille 10 colonnes
    m11 = mapping["UB03-011"]
    assert (m11["index"], m11["col"], m11["row"]) == (11, 1, 1)
    assert (m11["x"], m11["y"]) == (1 * w, 1 * h)
    # Carte 70 -> 1re de la planche 1, index local 0
    m70 = mapping["UB03-070"]
    assert m70["sheet"] == "sheets/sheet_001.jpg"
    assert (m70["index"], m70["col"], m70["row"]) == (0, 0, 0)

    # Dimensions réelles de la planche générée
    with Image.open(tmp_path / "sheets" / "sheet_000.jpg") as im:
        assert im.size == (cols * w, rows * h)


# ─────────────────── 4. cache incrémental (download) ───────────────
class FakeResp:
    def __init__(self, content): self.content = content; self.status_code = 200


class FakeSession:
    """Compte les GET réellement émis pour vérifier le cache."""
    def __init__(self): self.calls = []
    def get(self, url, **kw):
        self.calls.append(url)
        return FakeResp(b"\x89PNG fake bytes")


def test_download_cache_incremental(tmp_path):
    sess = FakeSession()
    cards = {"UB03-001": "https://x/UB03-001.webp",
             "UB03-002": "https://x/UB03-002.webp"}
    # 1er run : tout est téléchargé
    p1 = S.download_images(sess, cards, tmp_path, delay=0)
    assert len(p1) == 2
    assert len(sess.calls) == 2, "1er run = 2 téléchargements"

    # 2e run : tout est en cache -> aucun nouvel appel
    sess2 = FakeSession()
    p2 = S.download_images(sess2, cards, tmp_path, delay=0)
    assert len(p2) == 2
    assert len(sess2.calls) == 0, "2e run = 0 téléchargement (cache)"

    # Ajout d'une carte -> seule la nouvelle est téléchargée
    cards["UB03-003"] = "https://x/UB03-003.webp"
    sess3 = FakeSession()
    p3 = S.download_images(sess3, cards, tmp_path, delay=0)
    assert len(p3) == 3
    assert sess3.calls == ["https://x/UB03-003.webp"], sess3.calls


def test_download_ignores_empty_cached_file(tmp_path):
    """Un fichier présent mais vide (0 octet) doit être re-téléchargé."""
    (tmp_path / "UB03-009.webp").write_bytes(b"")  # cache corrompu
    sess = FakeSession()
    S.download_images(sess, {"UB03-009": "https://x/UB03-009.webp"}, tmp_path, delay=0)
    assert sess.calls == ["https://x/UB03-009.webp"]


# ─────────────────── runner sans pytest ────────────────────────────
def _run_standalone():
    import tempfile, traceback
    tests = [
        test_card_code_re_captures_valid_codes,
        test_card_code_re_alt_suffix,
        test_extract_ignores_nav_logos,
        test_extract_prefers_data_src_over_src,
        test_extract_zero_cards_does_not_crash,
        test_spritesheet_grid_positions,
        test_download_cache_incremental,
        test_download_ignores_empty_cached_file,
    ]
    ok = 0
    for t in tests:
        try:
            if "tmp_path" in t.__code__.co_varnames:
                with tempfile.TemporaryDirectory() as d:
                    t(Path(d))
            else:
                t()
            print(f"  PASS  {t.__name__}")
            ok += 1
        except Exception:
            print(f"  FAIL  {t.__name__}")
            traceback.print_exc()
    print(f"\n{ok}/{len(tests)} tests réussis.")
    return ok == len(tests)


if __name__ == "__main__":
    sys.exit(0 if _run_standalone() else 1)
