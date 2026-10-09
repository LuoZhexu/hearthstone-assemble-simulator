"""Cache every simulator candidate's full card render as a local WebP image.

Uses existing local preview-card images when available. Other renders are
downloaded once from the same URLs the simulator currently uses. Safe to rerun:
valid local files are skipped and failed downloads can be retried.
"""

import argparse
import io
import json
import os
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

from PIL import Image


HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
IMAGE_ROOT = ROOT / "工作区/NGA简中更新"
CACHE = IMAGE_ROOT / "cache/preview_cards_reign-of-the-black-empire.json"
OUTPUT = HERE / "assets/cards"
USER_AGENT = "Mozilla/5.0 (compatible; AssembleSimulator/1.0)"


def cards():
    source = (HERE / "data.js").read_text(encoding="utf-8-sig").strip()
    return json.loads(source.removeprefix("window.ASSEMBLE_DATA=").removesuffix(";"))["cards"]


def valid(path):
    if not path.is_file():
        return False
    try:
        with Image.open(path) as image:
            image.verify()
        return True
    except (OSError, ValueError):
        return False


def render_url(card):
    if card["image"]:
        return card["image"]
    if card["id"]:
        return f"https://art.hearthstonejson.com/v1/render/latest/zhCN/512x/{card['id']}.png"
    raise ValueError(f"{card['name']} 没有本地预览图，也没有可下载的卡牌 ID")


def save_webp(data, target):
    with Image.open(io.BytesIO(data)) as image:
        image.load()
        if image.width < 300 or image.height < 450:
            raise ValueError(f"图片尺寸异常：{image.size}")
        temporary = target.with_suffix(".webp.part")
        image.save(temporary, format="WEBP", quality=90, method=6)
        os.replace(temporary, target)


def cache_one(card, preview_by_dbf):
    target = OUTPUT / f"{card['dbf']}.webp"
    if valid(target):
        return "cached", card["name"]
    preview = preview_by_dbf.get(card["dbf"], {})
    local_relative = preview.get("local_image")
    if local_relative:
        local = IMAGE_ROOT / local_relative
        if local.is_file():
            save_webp(local.read_bytes(), target)
            return "preview", card["name"]
    url = render_url(card)
    last_error = None
    for attempt in range(3):
        try:
            request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(request, timeout=20) as response:
                if not (response.headers.get("Content-Type") or "").startswith("image/"):
                    raise ValueError("服务器没有返回图片")
                data = response.read(12_000_001)
            if len(data) > 12_000_000:
                raise ValueError("图片大于 12 MB")
            save_webp(data, target)
            return "downloaded", card["name"]
        except (OSError, ValueError) as error:
            last_error = error
            if attempt < 2:
                time.sleep(attempt + 1)
    return "failed", f"{card['name']}（{card['dbf']}）：{last_error}"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--workers", type=int, default=8)
    args = parser.parse_args()
    OUTPUT.mkdir(parents=True, exist_ok=True)
    preview_by_dbf = {
        card["id"]: card
        for card in json.loads(CACHE.read_text(encoding="utf-8"))["cards"]
    }
    candidates = cards()
    counts = {"cached": 0, "preview": 0, "downloaded": 0, "failed": 0}
    failures = []
    with ThreadPoolExecutor(max_workers=args.workers) as executor:
        jobs = [executor.submit(cache_one, card, preview_by_dbf) for card in candidates]
        for index, future in enumerate(as_completed(jobs), 1):
            status, detail = future.result()
            counts[status] += 1
            if status == "failed":
                failures.append(detail)
            if index % 20 == 0 or index == len(candidates):
                print(f"{index}/{len(candidates)}：{counts}", flush=True)
    if failures:
        print("下载失败：", *failures, sep="\n", flush=True)
        raise SystemExit(1)
    print(f"本地卡图总大小：{sum(p.stat().st_size for p in OUTPUT.glob('*.webp')) / 1024 / 1024:.1f} MB")


if __name__ == "__main__":
    main()
