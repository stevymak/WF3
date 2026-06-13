#!/usr/bin/env python3
"""
DBSCG Masters — Récupération des illustrations façon mod TTS
=============================================================
1. Scrape la liste des cartes sur le site officiel Bandai (dbs-cardgame.com)
2. Télécharge les images de cartes (avec cache local : relance = incrémental)
3. Génère des spritesheets (grille 10x7 par défaut, comme les mods TTS)
4. Produit cards.json : mapping code carte -> position dans la spritesheet
   + image individuelle, prêt à inclure dans le jeu (DBSCG Arena).

Usage :
    python scrape_dbscg.py                          # auto-découverte des sets
    python scrape_dbscg.py --categories 428030      # un set précis (UB03)
    python scrape_dbscg.py --categories 428030 428029 --no-sheets
    python scrape_dbscg.py --lang us-en --out ./assets

Sortie (dossier --out, défaut ./dbscg_assets) :
    cards/UB03-001.webp ...        images individuelles
    sheets/sheet_000.jpg ...       spritesheets 10x7
    cards.json                     mapping complet
"""
import argparse
import json
import re
import sys
import time
from pathlib import Path
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup
from PIL import Image

BASE = "https://www.dbs-cardgame.com"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                  "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36",
    "Accept-Language": "en-US,en;q=0.9,fr;q=0.8",
}

# Code carte : BT27-001, UB03-123, P-456, SD22-01, FB01-001_p1 (versions alt), etc.
CARD_CODE_RE = re.compile(r"([A-Z]{1,4}\d{0,3}-\d{2,4}(?:_[A-Za-z0-9]+)?)", re.I)


def get(session: requests.Session, url: str, retries: int = 3, **kw):
    """GET avec retries + backoff, pour rester poli avec le serveur."""
    for attempt in range(retries):
        try:
            r = session.get(url, headers=HEADERS, timeout=30, **kw)
            if r.status_code == 200:
                return r
            print(f"  ! HTTP {r.status_code} sur {url}")
        except requests.RequestException as e:
            print(f"  ! Erreur réseau ({e}) — tentative {attempt + 1}/{retries}")
        time.sleep(2 * (attempt + 1))
    return None


def discover_categories(session: requests.Session, lang: str) -> dict[str, str]:
    """Trouve tous les sets (IDs de catégorie) depuis la page CARD LIST."""
    url = f"{BASE}/{lang}/cardlist/"
    print(f"[1/4] Découverte des sets sur {url}")
    r = get(session, url)
    if not r:
        sys.exit("Impossible de charger la page cardlist. Vérifie ta connexion / le site.")
    soup = BeautifulSoup(r.text, "html.parser")
    cats: dict[str, str] = {}
    for a in soup.find_all("a", href=True):
        m = re.search(r"category=(\d+)", a["href"])
        if m:
            label = a.get_text(" ", strip=True) or m.group(1)
            cats[m.group(1)] = label[:80]
    print(f"      {len(cats)} sets trouvés.")
    return cats


def extract_card_images(html: str, page_url: str) -> dict[str, str]:
    """Extrait {code_carte: url_image} d'une page de cardlist.

    Générique exprès : on prend toutes les <img> (src / data-src / data-original)
    dont le nom de fichier contient un code de carte. Résiste aux refontes du site.
    """
    soup = BeautifulSoup(html, "html.parser")
    found: dict[str, str] = {}
    for img in soup.find_all("img"):
        src = img.get("data-src") or img.get("data-original") or img.get("src") or ""
        if not src or "cardlist" not in src and "card" not in src.lower():
            continue
        filename = Path(urlparse(src).path).name
        m = CARD_CODE_RE.search(filename)
        if not m:
            continue
        code = m.group(1).upper()
        full = urljoin(page_url, src)
        # Préférer la plus "grande" si plusieurs variantes (heuristique simple)
        if code not in found or len(full) > len(found[code]):
            found[code] = full
    return found


def scrape_category(session: requests.Session, lang: str, cat_id: str) -> dict[str, str]:
    url = f"{BASE}/{lang}/cardlist/?search=true&category={cat_id}"
    r = get(session, url)
    if not r:
        return {}
    return extract_card_images(r.text, url)


def download_images(session: requests.Session, cards: dict[str, str],
                    out_dir: Path, delay: float) -> dict[str, Path]:
    out_dir.mkdir(parents=True, exist_ok=True)
    paths: dict[str, Path] = {}
    todo = []
    for code, url in sorted(cards.items()):
        ext = Path(urlparse(url).path).suffix or ".webp"
        dest = out_dir / f"{code}{ext}"
        if dest.exists() and dest.stat().st_size > 0:
            paths[code] = dest  # cache : déjà téléchargée
        else:
            todo.append((code, url, dest))
    print(f"[3/4] Téléchargement : {len(todo)} nouvelles, {len(paths)} en cache.")
    for i, (code, url, dest) in enumerate(todo, 1):
        r = get(session, url)
        if r and r.content:
            dest.write_bytes(r.content)
            paths[code] = dest
            print(f"      [{i}/{len(todo)}] {code}")
        else:
            print(f"      [{i}/{len(todo)}] ÉCHEC {code} ({url})")
        time.sleep(delay)  # politesse : ne pas marteler le serveur
    return paths


def build_spritesheets(paths: dict[str, Path], sheets_dir: Path,
                       cols: int, rows: int, card_w: int, card_h: int,
                       fmt: str = "jpg") -> dict:
    """Assemble les images en planches cols x rows (style mods TTS)."""
    sheets_dir.mkdir(parents=True, exist_ok=True)
    codes = sorted(paths.keys())
    per_sheet = cols * rows
    mapping: dict[str, dict] = {}
    sheet_files: list[str] = []
    n_sheets = (len(codes) + per_sheet - 1) // per_sheet
    print(f"[4/4] Spritesheets : {len(codes)} cartes -> {n_sheets} planche(s) {cols}x{rows}")
    for s in range(n_sheets):
        chunk = codes[s * per_sheet:(s + 1) * per_sheet]
        sheet = Image.new("RGB", (cols * card_w, rows * card_h), (20, 20, 28))
        for idx, code in enumerate(chunk):
            col, row = idx % cols, idx // cols
            try:
                with Image.open(paths[code]) as im:
                    im = im.convert("RGB").resize((card_w, card_h), Image.LANCZOS)
                    sheet.paste(im, (col * card_w, row * card_h))
            except Exception as e:
                print(f"      ! Image illisible {code}: {e}")
                continue
            mapping[code] = {
                "sheet": f"sheets/sheet_{s:03d}.{fmt}",
                "index": idx, "col": col, "row": row,
                "x": col * card_w, "y": row * card_h, "w": card_w, "h": card_h,
            }
        fname = sheets_dir / f"sheet_{s:03d}.{fmt}"
        sheet.save(fname, quality=88)
        sheet_files.append(fname.name)
        print(f"      {fname.name} ({len(chunk)} cartes)")
    return {"mapping": mapping, "sheets": sheet_files}


def main():
    ap = argparse.ArgumentParser(description="Scraper DBSCG Masters (Bandai) -> images + spritesheets + JSON")
    ap.add_argument("--lang", default="us-en", help="Section du site (us-en, europe-fr, ...)")
    ap.add_argument("--categories", nargs="*", default=None,
                    help="IDs de catégories Bandai (ex: 428030). Vide = tous les sets.")
    ap.add_argument("--out", default="dbscg_assets", help="Dossier de sortie")
    ap.add_argument("--delay", type=float, default=0.6, help="Pause entre téléchargements (s)")
    ap.add_argument("--cols", type=int, default=10)
    ap.add_argument("--rows", type=int, default=7)
    ap.add_argument("--card-width", type=int, default=400)
    ap.add_argument("--card-height", type=int, default=560)
    ap.add_argument("--no-sheets", action="store_true", help="Images individuelles + JSON seulement")
    args = ap.parse_args()

    out = Path(args.out)
    session = requests.Session()

    # 1. Sets à traiter
    all_cats = discover_categories(session, args.lang)
    if args.categories:
        cats = {c: all_cats.get(c, c) for c in args.categories}
    else:
        cats = all_cats
        print("      (aucun --categories fourni : TOUS les sets seront scrapés, ça peut être long)")

    # 2. Scrape des listes
    print(f"[2/4] Scrape de {len(cats)} set(s)…")
    cards: dict[str, str] = {}
    sets_of: dict[str, str] = {}
    for cat_id, label in cats.items():
        found = scrape_category(session, args.lang, cat_id)
        for code in found:
            sets_of.setdefault(code, label)
        cards.update(found)
        print(f"      [{cat_id}] {label} -> {len(found)} cartes (total {len(cards)})")
        time.sleep(args.delay)

    if not cards:
        sys.exit("Aucune carte trouvée. Le site a peut-être changé — inspecte le HTML et adapte CARD_CODE_RE.")

    # 3. Téléchargement
    paths = download_images(session, cards, out / "cards", args.delay)

    # 4. Spritesheets + JSON
    data = {
        "generated": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "source": f"{BASE}/{args.lang}/cardlist/",
        "cardCount": len(paths),
        "sheetGrid": {"cols": args.cols, "rows": args.rows,
                      "cardWidth": args.card_width, "cardHeight": args.card_height},
        "cards": {},
    }
    sheet_info = {"mapping": {}, "sheets": []}
    if not args.no_sheets:
        sheet_info = build_spritesheets(paths, out / "sheets", args.cols, args.rows,
                                        args.card_width, args.card_height)
    data["sheets"] = sheet_info["sheets"]
    for code, p in sorted(paths.items()):
        entry = {"image": f"cards/{p.name}", "set": sets_of.get(code, ""),
                 "sourceUrl": cards.get(code, "")}
        if code in sheet_info["mapping"]:
            entry.update(sheet_info["mapping"][code])
        data["cards"][code] = entry

    json_path = out / "cards.json"
    json_path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\n✔ Terminé : {len(paths)} cartes, JSON -> {json_path}")
    print("  Usage privé uniquement — les illustrations restent la propriété de Bandai/Toei.")


if __name__ == "__main__":
    main()
