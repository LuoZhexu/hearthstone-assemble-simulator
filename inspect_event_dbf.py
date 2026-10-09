"""Read assembly-related card tags from the installed preview client's DBF bundle.

Usage: python inspect_event_dbf.py "C:/Program Files (x86)/Hearthstone Event 1/Data/Win/dbf.unity3d"
Requires UnityPy on PYTHONPATH. The game installation is read-only; reports go to tag-audit/.
"""

import argparse
import csv
import json
import re
import warnings
from collections import Counter, defaultdict
from pathlib import Path

from inspect_assemble_tags import HERE, TAG_NAMES, simulator_cards

KEYWORD_TAG_IDS = {217, 218}  # Deathrattle and Battlecry, used for conflict checks.


def load_tables(path, unity_version):
    import UnityPy

    UnityPy.config.FALLBACK_UNITY_VERSION = unity_version
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", category=Warning)
        env = UnityPy.load(str(path))
    wanted = {"CARD", "CARD_TAG"}
    objects = {
        obj.peek_name(): obj for obj in env.objects
        if obj.type.name == "MonoBehaviour" and obj.peek_name() in wanted
    }
    if set(objects) != wanted:
        raise ValueError(f"DBF 缺少数据表：{wanted - set(objects)}")
    cards = {}
    for row in objects["CARD"].read_typetree()["Records"]:
        cards[row["m_ID"]] = {
            "dbf": row["m_ID"],
            "id": row["m_noteMiniGuid"],
            "name": row["m_name"]["m_locValues"][12],  # zhCN
        }
    tags = defaultdict(dict)
    for row in objects["CARD_TAG"].read_typetree()["Records"]:
        if row["m_tagId"] in TAG_NAMES or row["m_tagId"] in KEYWORD_TAG_IDS:
            tags[row["m_cardId"]][row["m_tagId"]] = row["m_tagValue"]
    return cards, tags


def write_csv(path, rows):
    fields = ["dbf", "card_id", "name", "type", "cost", "in_client", *map(str, TAG_NAMES)]
    with path.open("w", encoding="utf-8-sig", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("dbf", type=Path)
    parser.add_argument("--unity-version", default="6000.3.11f1")
    args = parser.parse_args()
    cards, tags = load_tables(args.dbf, args.unity_version)
    product_db = args.dbf.parents[2] / ".product.db"
    match = re.search(rb"\d+\.\d+\.\d+\.\d+", product_db.read_bytes()) if product_db.exists() else None
    client_version = match.group().decode("ascii") if match else "未知"
    current_pool = simulator_cards(HERE / "data.js")
    by_id = {c["id"]: c for c in cards.values() if c["id"]}
    report_dir = HERE / "tag-audit"
    report_dir.mkdir(exist_ok=True)
    snapshot = {
        "clientVersion": client_version,
        "tagsByDbf": {
            str(card["dbf"]): {str(tag): value for tag, value in tags[card["dbf"]].items()}
            for card in cards.values() if tags.get(card["dbf"])
        },
        "tagsByCardId": {
            card["id"]: {str(tag): value for tag, value in tags[card["dbf"]].items()}
            for card in cards.values() if card["id"] and tags.get(card["dbf"])
        },
    }
    (HERE / "client_tags.json").write_text(
        json.dumps(snapshot, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8"
    )

    def row_for(card, typ="", cost="", present="是"):
        result = {
            "dbf": card["dbf"], "card_id": card["id"], "name": card["name"],
            "type": typ, "cost": cost, "in_client": present,
        }
        for tag_id in TAG_NAMES:
            result[str(tag_id)] = tags.get(card["dbf"], {}).get(tag_id, 0) if present == "是" else ""
        return result

    pool_rows = []
    matched = set()
    for current in current_pool:
        client = cards.get(current["dbf"]) or by_id.get(current["id"])
        if client:
            matched.add(client["dbf"])
            pool_rows.append(row_for(client, current["type"], current["cost"]))
        else:
            pool_rows.append(row_for(current, current["type"], current["cost"], "否"))
    all_rows = [row_for(card) for card in cards.values()
                if any(tags.get(card["dbf"], {}).get(tag_id) for tag_id in TAG_NAMES)]
    all_rows.sort(key=lambda row: row["dbf"])
    write_csv(report_dir / "模拟器组件标签.csv", pool_rows)
    write_csv(report_dir / "试玩服带标签卡牌.csv", all_rows)

    lines = [
        "# 试玩服拼装标签核对", "",
        f"来源：`{args.dbf}`；客户端版本：{client_version}。", "",
        f"客户端卡牌：{len(cards)}；模拟器组件：{len(current_pool)}；匹配：{len(matched)}。", "",
        "标签编号与中文含义按用户提供的线索标记；文件本身只证明编号和值，不直接证明配对算法。", "",
        "| 编号 | 暂定含义 | 取值分布 | 组件池中非零 | 示例 |", "| --- | --- | --- | ---: | --- |",
    ]
    for tag_id, label in TAG_NAMES.items():
        matching = [(card, tags[card["dbf"]][tag_id]) for card in cards.values()
                    if tags.get(card["dbf"], {}).get(tag_id)]
        values = Counter(value for _, value in matching)
        in_pool = sum(bool(row.get(str(tag_id))) for row in pool_rows)
        examples = "、".join(f"{c['name']}（{c['id']}）" for c, _ in matching[:5])
        lines.append(f"| {tag_id} | {label} | {dict(values)} | {in_pool} | {examples} |")
    tagged_components = [row for row in pool_rows if row.get("4533")]
    missing = [row for row in pool_rows if row["in_client"] == "否"]
    non_component = [row for row in pool_rows if row["in_client"] == "是" and not row.get("4533")]
    lines += ["", f"当前池有 4533 标签：{len(tagged_components)}；没有：{len(non_component)}；客户端中未匹配：{len(missing)}。", ""]
    lines += [
        f"4533 标签覆盖 {len({row['name'] for row in all_rows if row['4533']})} 个不同中文卡名；",
        f"当前组件池中 4547（仅作主体）有 {sum(bool(row['4547']) for row in pool_rows)} 张，",
        f"4546（不可作主体）的随从有 {sum(row['type'] == '随从' and bool(row['4546']) for row in pool_rows)} 张。",
        f"按 4533 且非 4547 计算，当前去重后可作组件的卡牌有 {sum(bool(row['4533']) and not row['4547'] for row in pool_rows)} 张。",
        "",
    ]
    if non_component:
        lines += ["当前表格中没有 4533 的卡牌：" + "、".join(f"{row['name']}（{row['card_id']}）" for row in non_component) + "。", ""]
    lines += ["模拟器已按 4533／4546／4547 筛选；4578 与另一张自带回合结束触发效果的卡双向整卡互斥，不再按战吼 218 排除。其他互斥规则仍需试玩服实测。", ""]
    lines += ["详细逐卡结果见 `模拟器组件标签.csv` 和 `试玩服带标签卡牌.csv`。", ""]
    (report_dir / "试玩服标签总览.md").write_text("\n".join(lines), encoding="utf-8")
    print("\n".join(lines))


if __name__ == "__main__":
    main()
