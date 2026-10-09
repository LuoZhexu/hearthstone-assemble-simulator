"""Compare an extracted CardDefs.xml with this simulator's card pool.

Usage: python inspect_assemble_tags.py path/to/CardDefs.xml
Only reads the supplied game data. Writes a CSV and a short report beside this script.
"""

import argparse
import csv
import json
from collections import Counter
from pathlib import Path
from xml.etree import ElementTree as ET


HERE = Path(__file__).resolve().parent
TAG_NAMES = {
    4533: "拼装组件",
    4546: "非拼装主体",
    4547: "仅拼装主体",
    4548: "亡语互斥",
    4577: "回合结束互斥",
    4578: "回合结束效果禁配",
    4930: "施法互斥",
    4931: "获取卡牌互斥",
    4932: "英雄攻击后互斥",
    4975: "随从攻击互斥",
}


def simulator_cards(path):
    content = path.read_text(encoding="utf-8-sig").strip()
    prefix = "window.ASSEMBLE_DATA="
    if not content.startswith(prefix):
        raise ValueError(f"不是模拟器生成的数据文件：{path}")
    return json.loads(content[len(prefix):].removesuffix(";"))["cards"]


def tag_value(raw):
    try:
        return int(raw)
    except (TypeError, ValueError):
        return 1 if str(raw).lower() == "true" else 0


def read_carddefs(path):
    """Stream a large CardDefs.xml without loading it all into memory."""
    root = None
    build = "未标注"
    cards = []
    for event, element in ET.iterparse(path, events=("start", "end")):
        if root is None and event == "start":
            root = element
            build = element.attrib.get("version", element.attrib.get("build", build))
        if event != "end" or element.tag != "Entity":
            continue
        dbf_raw = element.attrib.get("ID") or element.attrib.get("DbfId")
        dbf = int(dbf_raw) if dbf_raw and dbf_raw.isdigit() else None
        tags = {}
        names = {}
        name = ""
        for tag in element.findall("Tag"):
            number = tag.attrib.get("enumID")
            if number and number.isdigit() and int(number) in TAG_NAMES:
                tag_id = int(number)
                tags[tag_id] = tag_value(tag.attrib.get("value"))
                names[tag_id] = tag.attrib.get("name", "")
            if tag.attrib.get("name") == "CARDNAME":
                name = tag.findtext("zhCN") or tag.findtext("enUS") or ""
        cards.append({
            "dbf": dbf,
            "id": element.attrib.get("CardID", ""),
            "name": name,
            "tags": tags,
            "tag_names": names,
        })
        element.clear()
        if root is not None:
            root.clear()
    return build, cards


def write_report(carddefs_path, data_path, output_dir):
    build, extracted = read_carddefs(carddefs_path)
    pool = simulator_cards(data_path)
    by_dbf = {card["dbf"]: card for card in extracted if card["dbf"] is not None}
    by_id = {card["id"]: card for card in extracted if card["id"]}
    rows = []
    matched_ids = set()
    for card in pool:
        found = by_dbf.get(card["dbf"]) or by_id.get(card["id"])
        if found:
            matched_ids.add((found["dbf"], found["id"]))
        row = {
            "dbf": card["dbf"], "card_id": card["id"] or "", "name": card["name"],
            "type": card["type"], "cost": card["cost"],
            "in_carddefs": "是" if found else "否",
        }
        for tag_id in TAG_NAMES:
            row[str(tag_id)] = found["tags"].get(tag_id, 0) if found else ""
        rows.append(row)

    output_dir.mkdir(parents=True, exist_ok=True)
    csv_path = output_dir / "拼装标签对照.csv"
    fields = ["dbf", "card_id", "name", "type", "cost", "in_carddefs", *map(str, TAG_NAMES)]
    with csv_path.open("w", encoding="utf-8-sig", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)

    counts = Counter()
    for row in rows:
        for tag_id in TAG_NAMES:
            if row[str(tag_id)] not in ("", 0):
                counts[tag_id] += 1
    total_tagged = sum(any(value for value in card["tags"].values()) for card in extracted)
    missing = [row for row in rows if row["in_carddefs"] == "否"]
    extras = [card for card in extracted if card["tags"].get(4533)
              and (card["dbf"], card["id"]) not in matched_ids]

    lines = [
        "# 拼装标签核对报告", "",
        f"- 数据文件：`{carddefs_path.name}`",
        f"- 数据版本：{build}",
        f"- 已解析卡牌：{len(extracted)} 张；其中带有待查标签：{total_tagged} 张",
        f"- 模拟器组件：{len(pool)} 张；在数据中找到：{len(pool) - len(missing)} 张",
        "",
        "| 编号 | 暂定含义 | 模拟器组件中命中 | 数据中的标签名 |",
        "|---:|---|---:|---|",
    ]
    if not any(card["tags"].get(4533) for card in extracted):
        lines.insert(7, "**注意：这份数据没有发现 4533。请先确认它来自正确的试玩服版本。**")
        lines.insert(8, "")
    for tag_id, label in TAG_NAMES.items():
        observed_names = sorted({card["tag_names"].get(tag_id, "") for card in extracted
                                 if card["tags"].get(tag_id) and card["tag_names"].get(tag_id)})
        lines.append(f"| {tag_id} | {label} | {counts[tag_id]} | {', '.join(observed_names) or '未提供'} |")
    lines += ["", "## 每个标签的样本", ""]
    for tag_id, label in TAG_NAMES.items():
        examples = [row["name"] for row in rows if row[str(tag_id)] not in ("", 0)][:12]
        lines.append(f"- {tag_id} {label}：{'、'.join(examples) if examples else '模拟器中无命中'}")
    lines += [
        "", f"## 当前表格以外的 4533 卡牌（{len(extras)} 张）", "",
        *[f"- {card['dbf'] or '?'} / {card['id'] or '?'} / {card['name'] or '未提供卡名'}" for card in extras[:100]],
    ]
    if len(extras) > 100:
        lines.append(f"- 其余 {len(extras) - 100} 张省略。")
    lines += ["", f"## 未能按 ID 对上的模拟器组件（{len(missing)} 张）", ""]
    lines += [f"- {row['dbf']} / {row['name']}" for row in missing[:100]]
    if len(missing) > 100:
        lines.append(f"- 其余 {len(missing) - 100} 张省略。")
    lines += [
        "", "## 判读提醒", "",
        "数字标签仅证明卡牌带有该标记；‘互斥’在拼装时如何作用，仍需用试玩服实际选项验证。",
        "在完成实例比对前，不应仅凭标签名直接改动抽取与配对逻辑。", "",
    ]
    report_path = output_dir / "拼装标签报告.md"
    report_path.write_text("\n".join(lines), encoding="utf-8")
    return report_path, csv_path


def main():
    parser = argparse.ArgumentParser(description="核对拼装标签与模拟器组件表")
    parser.add_argument("carddefs", type=Path, help="从试玩服提取的 CardDefs.xml")
    parser.add_argument("--data", type=Path, default=HERE / "data.js", help="模拟器数据文件")
    parser.add_argument("--output", type=Path, default=HERE / "tag-audit", help="报告输出目录")
    args = parser.parse_args()
    report, table = write_report(args.carddefs, args.data, args.output)
    print(f"报告：{report}\n逐卡对照：{table}")


if __name__ == "__main__":
    main()
