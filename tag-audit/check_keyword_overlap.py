"""Compare standard keyword tags with the preview client's assembly conflict tags."""

import sys
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from inspect_assemble_tags import simulator_cards


def main():
    import UnityPy

    UnityPy.config.FALLBACK_UNITY_VERSION = "6000.3.11f1"
    bundle = Path(r"C:\Program Files (x86)\Hearthstone Event 1\Data\Win\dbf.unity3d")
    env = UnityPy.load(str(bundle))
    obj = next(obj for obj in env.objects if obj.type.name == "MonoBehaviour" and obj.peek_name() == "CARD_TAG")
    wanted = {217, 218, 4548, 4577, 4578, 4930, 4931, 4932, 4975}
    tags = defaultdict(set)
    for row in obj.read_typetree()["Records"]:
        if row["m_tagId"] in wanted and row["m_tagValue"]:
            tags[row["m_cardId"]].add(row["m_tagId"])
    cards = simulator_cards(ROOT / "data.js")
    for keyword, conflict, label, word in ((217, 4548, "亡语", "亡语"), (218, 4578, "战吼", "战吼")):
        counts = Counter((keyword in tags[c["dbf"]], conflict in tags[c["dbf"]]) for c in cards)
        print(label, "standard/conflict overlap", dict(counts))
        for a, b in ((True, False), (False, True), (True, True)):
            found = [c for c in cards if (keyword in tags[c["dbf"]], conflict in tags[c["dbf"]]) == (a, b)]
            print((a, b), len(found), "examples:", "、".join(c["name"] for c in found[:12]))
        top_word = [c for c in cards if word in c["top"]]
        print("keyword in top", len(top_word), "standard", sum(keyword in tags[c["dbf"]] for c in top_word),
              "conflict", sum(conflict in tags[c["dbf"]] for c in top_word))
        print("keyword top without standard:", "、".join(c["name"] for c in top_word if keyword not in tags[c["dbf"]]))

    for name in ("玉莲帮荷官", "树皮盾哨兵", "虚无行者", "呓语魔橱", "星界斡旋者", "咒术图书管理员"):
        for c in cards:
            if c["name"] == name:
                print(name, c["dbf"], sorted(tags[c["dbf"]]), c["top"], c["bottom"])

    for group in (4548, 4577, 4578, 4930, 4931, 4932, 4975):
        marked = [c for c in cards if group in tags[c["dbf"]]]
        print("group", group, "count", len(marked), "with standard deathrattle", sum(217 in tags[c["dbf"]] for c in marked),
              "battlecry", sum(218 in tags[c["dbf"]] for c in marked))


if __name__ == "__main__":
    main()
