"""Build the simulator's compact data file from the supplied component workbook.

Run with the bundled Python runtime. This script only reads the workbook.
"""

import json
import re
import shutil
from pathlib import Path

import openpyxl


HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
SOURCE = ROOT / "拼装组件.xlsx"
CACHE = ROOT / "工作区/NGA简中更新/cache/preview_cards_reign-of-the-black-empire.json"
IMAGE_ROOT = ROOT / "工作区/NGA简中更新"
TAGS_FILE = HERE / "client_tags.json"
LOCAL_CARDS = HERE / "assets/cards"

cache = json.loads(CACHE.read_text(encoding="utf-8"))
by_dbf = {card["id"]: card for card in cache["cards"]}
has_client_tag_snapshot = TAGS_FILE.exists()
client_tag_data = json.loads(TAGS_FILE.read_text(encoding="utf-8")) if has_client_tag_snapshot else {}
client_tags_by_dbf = client_tag_data.get("tagsByDbf", {})
client_tags_by_id = client_tag_data.get("tagsByCardId", {})
sheet = openpyxl.load_workbook(SOURCE, read_only=True, data_only=True).worksheets[0]
rows = list(sheet.values)
headers = rows[0]

current_sets = {"核心", "安戈洛龟途", "漫游翡翠梦境", "穿越时间流", "大地的裂变", "逃离紫罗兰监狱", "活动"}
KEYWORD_JOIN = re.compile(
    r"(^|[，,。；;：:、\s])"
    r"(巨型\+\d+|法术伤害\+\d+|超级风怒|可交易|战吼|亡语|嘲讽|圣盾|突袭|冲锋|潜行|风怒|复生|剧毒|吸血|磁力|回响|扰魔|连击|抉择|延系)"
    r"(?=[^\s，,。；;：:、！？!?])(?!(?:的|随从|牌|效果))"
)


def description(text):
    value = str(text).strip()
    while True:
        spaced = KEYWORD_JOIN.sub(lambda match: f"{match.group(1)}{match.group(2)} ", value)
        if spaced == value:
            return value
        value = spaced


def candidate(row):
    d = dict(zip(headers, row))
    normalized = by_dbf.get(d["dbfid"], {}).get("normalized", {})
    card_type = d["type"] or normalized.get("type")
    if not d["name"] or not d["拼装描述1"] or not d["拼装描述2"]:
        return None
    if "拼装" in str(d["拼装描述1"]) + str(d["拼装描述2"]):
        return None
    local_image = f"assets/cards/{d['dbfid']}.webp" if (LOCAL_CARDS / f"{d['dbfid']}.webp").exists() else ""
    return {
        "dbf": d["dbfid"], "id": d["id"], "name": d["name"],
        "type": card_type,
        "cost": d["cost"], "attack": d["atk"], "health": d["hp"],
        "race": d["specialType"] or "", "rarity": d["rarity"] or normalized.get("rarity") or "未标注",
        "cardClass": d["class"], "set": d["cardSet"] or "黑暗帝国的统治",
        "top": description(d["拼装描述1"]), "bottom": description(d["拼装描述2"]),
        "art": "",
        "image": local_image,
        "source": "拼装组件.xlsx",
        **({"tags": client_tags_by_dbf.get(str(d["dbfid"]), client_tags_by_id.get(d["id"], {}))}
           if has_client_tag_snapshot else {}),
    }


def priority(card):
    return (
        card["set"] in current_sets or card["set"] == "黑暗帝国的统治",
        bool(card["id"]),
        card["set"] == "核心",
    )


cards = {}
for row in rows[1:]:
    card = candidate(row)
    if card and (card["name"] not in cards or priority(card) > priority(cards[card["name"]])):
        cards[card["name"]] = card

RASHA_POOL = [
    "讲故事的始祖龟", "原始熊猫人", "死亡寒冰", "石雕工匠", "烬根毁灭者", "昆虫利爪", "魔古将领",
    "战地医师老兵", "艾瑞达欺诈者", "逐月幼龙", "沙漏侍者", "OC91战车", "彩翼灵龙", "大法师安东尼达斯",
]
missing_rasha_cards = set(RASHA_POOL) - cards.keys()
if missing_rasha_cards:
    raise ValueError(f"拉夏专属池有未收录的卡牌：{sorted(missing_rasha_cards)}")

source_ids = [128892, 129089, 129359, 129801, 129804, 129821, 129837, 129944, 130565, 130973, 131061, 131294, 132353]
definitions = {
    128892: ("fixed", 4), 129089: ("max", 3), 129359: ("fixed", 1),
    129801: ("class", "法师"), 129804: ("any", None), 129821: ("race", "机械"),
    129837: ("race", "野兽"), 129944: ("other-class", None),
    130565: ("deathrattle", None), 130973: ("taunt", None),
    131061: ("any", None), 131294: ("end-turn", None),
    132353: ("exclusive", None),
}
source_cards = []
assets = HERE / "assets"
assets.mkdir(exist_ok=True)
for dbf in source_ids:
    raw = by_dbf[dbf]
    card = raw["normalized"]
    local = IMAGE_ROOT / raw["local_image"]
    target = assets / f"{dbf}.png"
    shutil.copy2(local, target)
    kind, value = definitions[dbf]
    source_text = card["text_plain"]
    if dbf == 129821:
        source_text = source_text.replace("获取一张超载", "获取一张超负荷运转")
    source_entry = {
        "dbf": dbf, "name": card["name"], "cardClass": card["class"],
        "cost": card["mana"], "rarity": card["rarity"], "type": card["type"],
        "text": source_text, "image": f"assets/{dbf}.png",
        "filter": kind, "filterValue": value,
    }
    if dbf == 132353:
        hero_power = by_dbf[132368]
        shutil.copy2(IMAGE_ROOT / hero_power["local_image"], assets / "132368.png")
        source_entry.update({
            "poolNames": RASHA_POOL,
            "resultType": "passive-hero-power",
            "resultName": hero_power["normalized"]["name"],
            "resultImage": "assets/132368.png",
        })
    source_cards.append(source_entry)

payload = {"workbook": SOURCE.name, "componentRowCount": len(rows) - 1, "cards": list(cards.values()), "sources": source_cards}
(HERE / "data.js").write_text("window.ASSEMBLE_DATA=" + json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + ";\n", encoding="utf-8")
print(f"Wrote {len(cards)} unique components and {len(source_cards)} Assemble cards")
